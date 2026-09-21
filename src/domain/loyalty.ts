/**
 * Regras de fidelidade (funções puras).
 *
 * O saldo NUNCA é um número solto: é sempre a soma do ledger
 * (loyalty_transactions). Os pontos de nível usam o total já acumulado
 * ("lifetime"), então resgatar recompensas não rebaixa o cliente.
 */
import type {
  BusinessSettings,
  Campaign,
  LoyaltyLevel,
  LoyaltyReward,
  LoyaltyTransaction,
  RoundingMode,
} from "@/types";

export function roundPoints(value: number, mode: RoundingMode): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return mode === "ceil" ? Math.ceil(value) : mode === "round" ? Math.round(value) : Math.floor(value);
}

export interface VisitPoints {
  total: number;
  fromSpend: number;
  fromVisit: number;
  fromService: number;
  fromCampaign: number;
  multiplier: number;
}

function activeCampaigns(campaigns: Campaign[], at: number): Campaign[] {
  return campaigns.filter(
    (c) =>
      c.active &&
      new Date(c.startsAt).getTime() <= at &&
      at <= new Date(c.endsAt).getTime(),
  );
}

/** Pontos gerados por um atendimento concluído. */
export function pointsForVisit(args: {
  finalPriceCents: number;
  serviceBonus: number;
  loyalty: BusinessSettings["loyalty"];
  campaigns: Campaign[];
  at: number;
}): VisitPoints {
  const { loyalty } = args;
  const zero: VisitPoints = {
    total: 0,
    fromSpend: 0,
    fromVisit: 0,
    fromService: 0,
    fromCampaign: 0,
    multiplier: 1,
  };
  if (!loyalty.enabled || loyalty.model === "visits") return zero;

  const live = activeCampaigns(args.campaigns, args.at);
  const multiplier = Math.max(
    1,
    ...live.filter((c) => c.kind === "points_multiplier").map((c) => c.multiplier ?? 1),
  );
  const rawSpend = (Math.max(0, args.finalPriceCents) / 100) * loyalty.pointsPerReal;
  const fromSpend = roundPoints(rawSpend * multiplier, loyalty.rounding);
  const fromVisit = Math.max(0, loyalty.pointsPerVisit);
  const fromService = Math.max(0, args.serviceBonus);
  const fromCampaign = live
    .filter((c) => c.kind === "bonus_points")
    .reduce((sum, c) => sum + Math.max(0, c.bonusPoints ?? 0), 0);

  return {
    total: fromSpend + fromVisit + fromService + fromCampaign,
    fromSpend,
    fromVisit,
    fromService,
    fromCampaign,
    multiplier,
  };
}

export const balanceOf = (ledger: LoyaltyTransaction[], customerId: string): number =>
  ledger.filter((t) => t.customerId === customerId).reduce((s, t) => s + t.amount, 0);

/** Total de pontos já ganhos (nunca diminui ao resgatar ou expirar). */
export const lifetimePointsOf = (
  ledger: LoyaltyTransaction[],
  customerId: string,
): number =>
  ledger
    .filter(
      (t) =>
        t.customerId === customerId &&
        t.amount > 0 &&
        (t.type === "EARN" || t.type === "BONUS" || t.type === "ADJUSTMENT"),
    )
    .reduce((s, t) => s + t.amount, 0);

export function levelFor(lifetime: number, levels: LoyaltyLevel[]): LoyaltyLevel | null {
  const sorted = [...levels].sort((a, b) => a.minPoints - b.minPoints);
  let current: LoyaltyLevel | null = null;
  for (const l of sorted) if (lifetime >= l.minPoints) current = l;
  return current;
}

export function nextLevelFor(
  lifetime: number,
  levels: LoyaltyLevel[],
): { level: LoyaltyLevel; missing: number } | null {
  const next = [...levels]
    .sort((a, b) => a.minPoints - b.minPoints)
    .find((l) => l.minPoints > lifetime);
  return next ? { level: next, missing: next.minPoints - lifetime } : null;
}

/**
 * Quantidade de pontos que deve expirar agora. Os débitos (resgates e
 * expirações anteriores) consomem primeiro os pontos mais antigos, então:
 * expirável = pontos vencidos ganhos − total já debitado (nunca acima do saldo).
 * É idempotente: rodar duas vezes não expira duas vezes.
 */
export function expirablePoints(
  ledger: LoyaltyTransaction[],
  customerId: string,
  now: number,
): number {
  const mine = ledger.filter((t) => t.customerId === customerId);
  const earnedExpired = mine
    .filter((t) => t.amount > 0 && t.expiresAt && new Date(t.expiresAt).getTime() <= now)
    .reduce((s, t) => s + t.amount, 0);
  const debited = mine.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const balance = mine.reduce((s, t) => s + t.amount, 0);
  return Math.max(0, Math.min(earnedExpired - debited, balance));
}

export type RedeemBlock =
  | "inactive"
  | "out_of_stock"
  | "insufficient_points"
  | "loyalty_disabled";

export function redeemBlock(
  reward: LoyaltyReward,
  balance: number,
  loyaltyEnabled: boolean,
): RedeemBlock | null {
  if (!loyaltyEnabled) return "loyalty_disabled";
  if (!reward.active) return "inactive";
  if (reward.stock !== null && reward.stock <= 0) return "out_of_stock";
  if (balance < reward.costPoints) return "insufficient_points";
  return null;
}

/** Progresso de visitas até a próxima recompensa por visitas. */
export function visitProgress(completedVisits: number, goal: number) {
  if (goal <= 0) return { current: 0, goal: 0, remaining: 0 };
  const current = completedVisits % goal;
  return { current, goal, remaining: goal - current };
}
