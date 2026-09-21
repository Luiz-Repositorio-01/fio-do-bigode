/**
 * Serviços de fidelidade: transformam o estado de forma imutável e atômica.
 * Toda movimentação de pontos passa por `appendLedger` (append-only).
 * No backend real, cada função vira uma RPC/transaction no PostgreSQL.
 */
import { newId, rewardCode } from "@/utils/ids";
import type {
  Appointment,
  CustomerReward,
  DataState,
  LoyaltyTransaction,
  LoyaltyTransactionType,
} from "@/types";
import {
  balanceOf,
  expirablePoints,
  levelFor,
  lifetimePointsOf,
  nextLevelFor,
  pointsForVisit,
  redeemBlock,
  visitProgress,
} from "@/domain/loyalty";
import { daysUntilBirthday } from "@/domain/customers";
import { todayLocal, toLocalParts } from "@/domain/time";
import { DomainError } from "./errors";

const DAY_MS = 86_400_000;

interface LedgerEntry {
  customerId: string;
  type: LoyaltyTransactionType;
  amount: number;
  description: string;
  referenceType?: string | null;
  referenceId?: string | null;
  expiresAt?: string | null;
}

export function appendLedger(state: DataState, entry: LedgerEntry, now: number): DataState {
  if (!Number.isInteger(entry.amount) || entry.amount === 0) return state;
  const tx: LoyaltyTransaction = {
    id: newId("ltx"),
    businessId: state.business.id,
    customerId: entry.customerId,
    type: entry.type,
    amount: entry.amount,
    description: entry.description,
    referenceType: entry.referenceType ?? null,
    referenceId: entry.referenceId ?? null,
    createdAt: new Date(now).toISOString(),
    expiresAt: entry.expiresAt ?? null,
  };
  return { ...state, ledger: [...state.ledger, tx] };
}

function validityExpiry(state: DataState, now: number): string | null {
  const days = state.settings.loyalty.pointsValidityDays;
  return days ? new Date(now + days * DAY_MS).toISOString() : null;
}

function hasLedgerRef(state: DataState, type: LoyaltyTransactionType, refType: string, refId: string) {
  return state.ledger.some(
    (t) => t.type === type && t.referenceType === refType && t.referenceId === refId,
  );
}

export function issueCustomerReward(
  state: DataState,
  args: {
    customerId: string;
    rewardId: string;
    rewardName: string;
    validityDays: number | null;
    source: CustomerReward["source"];
    pointsSpent: number;
  },
  now: number,
): { state: DataState; customerReward: CustomerReward } {
  const taken = new Set(state.customerRewards.map((r) => r.code));
  let code = rewardCode();
  while (taken.has(code)) code = rewardCode();
  const customerReward: CustomerReward = {
    id: newId("crw"),
    businessId: state.business.id,
    customerId: args.customerId,
    rewardId: args.rewardId,
    rewardName: args.rewardName,
    code,
    status: "available",
    pointsSpent: args.pointsSpent,
    source: args.source,
    createdAt: new Date(now).toISOString(),
    expiresAt: args.validityDays ? new Date(now + args.validityDays * DAY_MS).toISOString() : null,
    usedAt: null,
  };
  return {
    state: { ...state, customerRewards: [...state.customerRewards, customerReward] },
    customerReward,
  };
}

/** Pontos de um atendimento concluído (idempotente por agendamento). */
export function awardVisitPoints(
  state: DataState,
  appointment: Appointment,
  finalPriceCents: number,
  now: number,
): { state: DataState; points: number } {
  if (hasLedgerRef(state, "EARN", "appointment", appointment.id)) {
    return { state, points: appointment.pointsAwarded };
  }
  const service = state.services.find((s) => s.id === appointment.serviceId);
  const result = pointsForVisit({
    finalPriceCents,
    serviceBonus: service?.pointsBonus ?? 0,
    loyalty: state.settings.loyalty,
    campaigns: state.campaigns,
    at: now,
  });
  if (result.total <= 0) return { state, points: 0 };
  const next = appendLedger(
    state,
    {
      customerId: appointment.customerId,
      type: "EARN",
      amount: result.total,
      description: `Atendimento concluído: ${appointment.serviceName}`,
      referenceType: "appointment",
      referenceId: appointment.id,
      expiresAt: validityExpiry(state, now),
    },
    now,
  );
  return { state: next, points: result.total };
}

/** Recompensa automática por número de visitas (modelo visitas/híbrido). */
export function grantVisitReward(
  state: DataState,
  customerId: string,
  completedVisits: number,
  now: number,
): DataState {
  const { loyalty } = state.settings;
  if (!loyalty.enabled || loyalty.model === "points") return state;
  if (loyalty.visitsGoal <= 0 || !loyalty.visitsRewardId) return state;
  if (completedVisits === 0 || completedVisits % loyalty.visitsGoal !== 0) return state;
  const reward = state.rewards.find((r) => r.id === loyalty.visitsRewardId);
  if (!reward) return state;
  return issueCustomerReward(
    state,
    {
      customerId,
      rewardId: reward.id,
      rewardName: reward.name,
      validityDays: reward.validityDays,
      source: "visits",
      pointsSpent: 0,
    },
    now,
  ).state;
}

/**
 * Indicação: só libera pontos quando o indicado conclui o PRIMEIRO atendimento
 * (ação válida), respeitando o limite mensal do indicador.
 */
export function qualifyReferral(
  state: DataState,
  refereeId: string,
  completedVisits: number,
  now: number,
): DataState {
  const cfg = state.settings.loyalty.referral;
  const referral = state.referrals.find(
    (r) => r.refereeId === refereeId && r.status === "registered",
  );
  if (!referral || completedVisits !== 1) return state;

  const iso = new Date(now).toISOString();
  const month = toLocalParts(now).date.slice(0, 7);
  const qualifiedThisMonth = state.referrals.filter(
    (r) =>
      r.referrerId === referral.referrerId &&
      r.status === "qualified" &&
      state.referralEvents.some(
        (e) =>
          e.referralId === r.id &&
          e.type === "qualified" &&
          toLocalParts(e.createdAt).date.slice(0, 7) === month,
      ),
  ).length;

  if (!cfg.enabled || (cfg.monthlyLimit > 0 && qualifiedThisMonth >= cfg.monthlyLimit)) {
    return {
      ...state,
      referrals: state.referrals.map((r) => (r.id === referral.id ? { ...r, status: "rejected" } : r)),
      referralEvents: [
        ...state.referralEvents,
        {
          id: newId("rev"),
          referralId: referral.id,
          type: "rejected",
          points: 0,
          note: cfg.enabled ? "Limite mensal de indicações atingido." : "Programa de indicação desativado.",
          createdAt: iso,
        },
      ],
    };
  }

  let next = state;
  if (cfg.referrerPoints > 0) {
    next = appendLedger(
      next,
      {
        customerId: referral.referrerId,
        type: "BONUS",
        amount: cfg.referrerPoints,
        description: "Indicação de amigo concluída",
        referenceType: "referral",
        referenceId: referral.id,
        expiresAt: validityExpiry(state, now),
      },
      now,
    );
  }
  if (cfg.refereePoints > 0) {
    next = appendLedger(
      next,
      {
        customerId: referral.refereeId,
        type: "BONUS",
        amount: cfg.refereePoints,
        description: "Bônus de boas-vindas por indicação",
        referenceType: "referral",
        referenceId: referral.id,
        expiresAt: validityExpiry(state, now),
      },
      now,
    );
  }
  return {
    ...next,
    referrals: next.referrals.map((r) => (r.id === referral.id ? { ...r, status: "qualified" } : r)),
    referralEvents: [
      ...next.referralEvents,
      {
        id: newId("rev"),
        referralId: referral.id,
        type: "qualified",
        points: cfg.referrerPoints + cfg.refereePoints,
        note: "Primeiro atendimento do indicado concluído.",
        createdAt: iso,
      },
    ],
  };
}

export function redeemReward(
  state: DataState,
  args: { customerId: string; rewardId: string },
  now: number,
): { state: DataState; customerReward: CustomerReward } {
  const reward = state.rewards.find((r) => r.id === args.rewardId);
  const customer = state.customers.find((c) => c.id === args.customerId);
  if (!reward || !customer) throw new DomainError("NOT_FOUND", "Recompensa ou cliente não encontrado.");
  const balance = balanceOf(state.ledger, customer.id);
  const block = redeemBlock(reward, balance, state.settings.loyalty.enabled);
  if (block) {
    const msg: Record<typeof block, string> = {
      inactive: "Essa recompensa não está disponível.",
      out_of_stock: "Recompensa esgotada.",
      insufficient_points: "Pontos insuficientes para resgatar.",
      loyalty_disabled: "O programa de fidelidade está desativado.",
    };
    throw new DomainError("LOYALTY", msg[block]);
  }
  let next = appendLedger(
    state,
    {
      customerId: customer.id,
      type: "REDEEM",
      amount: -reward.costPoints,
      description: `Recompensa resgatada: ${reward.name}`,
      referenceType: "reward",
      referenceId: reward.id,
    },
    now,
  );
  next = {
    ...next,
    rewards: next.rewards.map((r) =>
      r.id === reward.id && r.stock !== null ? { ...r, stock: r.stock - 1 } : r,
    ),
  };
  return issueCustomerReward(
    next,
    {
      customerId: customer.id,
      rewardId: reward.id,
      rewardName: reward.name,
      validityDays: reward.validityDays,
      source: "points",
      pointsSpent: reward.costPoints,
    },
    now,
  );
}

export function markRewardUsed(
  state: DataState,
  customerRewardId: string,
  now: number,
): DataState {
  const cr = state.customerRewards.find((r) => r.id === customerRewardId);
  if (!cr) throw new DomainError("NOT_FOUND", "Benefício não encontrado.");
  if (cr.status !== "available") throw new DomainError("INVALID_STATUS", "Benefício já utilizado ou expirado.");
  if (cr.expiresAt && new Date(cr.expiresAt).getTime() <= now) {
    throw new DomainError("INVALID_STATUS", "Benefício expirado.");
  }
  return {
    ...state,
    customerRewards: state.customerRewards.map((r) =>
      r.id === cr.id ? { ...r, status: "used", usedAt: new Date(now).toISOString() } : r,
    ),
  };
}

export function adjustPoints(
  state: DataState,
  args: { customerId: string; amount: number; reason: string },
  now: number,
): DataState {
  const reason = args.reason.trim();
  if (!reason) throw new DomainError("VALIDATION", "Informe o motivo do ajuste.");
  if (!Number.isInteger(args.amount) || args.amount === 0) {
    throw new DomainError("VALIDATION", "Informe uma quantidade de pontos diferente de zero.");
  }
  if (args.amount < 0 && balanceOf(state.ledger, args.customerId) + args.amount < 0) {
    throw new DomainError("LOYALTY", "O ajuste deixaria o saldo negativo.");
  }
  return appendLedger(
    state,
    {
      customerId: args.customerId,
      type: "ADJUSTMENT",
      amount: args.amount,
      description: `Ajuste manual: ${reason}`,
      referenceType: "manual",
      expiresAt: args.amount > 0 ? validityExpiry(state, now) : null,
    },
    now,
  );
}

/** Expira pontos vencidos e benefícios fora da validade. Idempotente. */
export function runExpiration(
  state: DataState,
  now: number,
): { state: DataState; expiredPoints: number; expiredRewards: number } {
  let next = state;
  let expiredPoints = 0;
  for (const c of state.customers) {
    const amount = expirablePoints(next.ledger, c.id, now);
    if (amount > 0) {
      expiredPoints += amount;
      next = appendLedger(
        next,
        {
          customerId: c.id,
          type: "EXPIRE",
          amount: -amount,
          description: "Pontos expirados",
          referenceType: "expiration",
          referenceId: todayLocal(now),
        },
        now,
      );
    }
  }
  let expiredRewards = 0;
  const customerRewards = next.customerRewards.map((r) => {
    if (r.status === "available" && r.expiresAt && new Date(r.expiresAt).getTime() <= now) {
      expiredRewards += 1;
      return { ...r, status: "expired" as const };
    }
    return r;
  });
  return { state: { ...next, customerRewards }, expiredPoints, expiredRewards };
}

/** Bônus de aniversário (uma vez por ano por cliente). */
export function grantBirthdayBonuses(
  state: DataState,
  now: number,
): { state: DataState; granted: number } {
  const bonus = state.settings.loyalty.birthdayBonusPoints;
  if (!state.settings.loyalty.enabled || bonus <= 0) return { state, granted: 0 };
  const today = todayLocal(now);
  const year = today.slice(0, 4);
  let next = state;
  let granted = 0;
  for (const c of state.customers) {
    if (daysUntilBirthday(c.birthDate, today) !== 0) continue;
    const refId = `${c.id}:${year}`;
    if (hasLedgerRef(next, "BONUS", "birthday", refId)) continue;
    next = appendLedger(
      next,
      {
        customerId: c.id,
        type: "BONUS",
        amount: bonus,
        description: "Bônus de aniversário",
        referenceType: "birthday",
        referenceId: refId,
        expiresAt: validityExpiry(state, now),
      },
      now,
    );
    granted += 1;
  }
  return { state: next, granted };
}

export interface LoyaltySummary {
  balance: number;
  lifetime: number;
  level: ReturnType<typeof levelFor>;
  next: ReturnType<typeof nextLevelFor>;
  completedVisits: number;
  visitProgress: ReturnType<typeof visitProgress>;
}

export function loyaltySummary(state: DataState, customerId: string): LoyaltySummary {
  const lifetime = lifetimePointsOf(state.ledger, customerId);
  const completedVisits = state.appointments.filter(
    (a) => a.customerId === customerId && a.status === "completed",
  ).length;
  return {
    balance: balanceOf(state.ledger, customerId),
    lifetime,
    level: levelFor(lifetime, state.levels),
    next: nextLevelFor(lifetime, state.levels),
    completedVisits,
    visitProgress: visitProgress(completedVisits, state.settings.loyalty.visitsGoal),
  };
}
