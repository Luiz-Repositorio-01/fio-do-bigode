import { describe, expect, it } from "vitest";
import { DomainError } from "@/services/errors";
import { completeAppointment, createBooking } from "@/services/booking";
import {
  adjustPoints,
  grantBirthdayBonuses,
  loyaltySummary,
  markRewardUsed,
  redeemReward,
  runExpiration,
} from "@/services/loyalty";
import { balanceOf, expirablePoints, pointsForVisit } from "@/domain/loyalty";
import type { DataState, LoyaltyReward } from "@/types";
import { NOW, TUESDAY, at, freshState, person } from "./helpers";

const DAY = 86_400_000;

const reward = (over: Partial<LoyaltyReward> = {}): LoyaltyReward => ({
  id: "rw_1",
  businessId: "biz_fio_do_bigode",
  name: "Recompensa de teste",
  description: "",
  kind: "other",
  costPoints: 100,
  validityDays: 30,
  stock: null,
  active: true,
  isDemo: false,
  ...over,
});

/** Cliente conclui um atendimento de R$ 150 (150 pontos). */
function customerWithPoints(state: DataState = freshState(), day = TUESDAY, price = 15000) {
  const b = createBooking(state, {
    serviceId: "svc_vip",
    professionalId: "pro_henrique",
    startsAt: at(day, "10:00"),
    ...person(1),
  }, NOW);
  const done = completeAppointment(b.state, { appointmentId: b.appointment.id, finalPriceCents: price }, NOW);
  return { state: done.state, customerId: b.customer.id, apptId: b.appointment.id };
}

describe("fluxo completo: atendimento → pontos → resgate", () => {
  it("cliente conclui atendimento, recebe pontos, resgata e o ledger fecha", () => {
    const start = customerWithPoints();
    const customerId = start.customerId;
    let state = start.state;
    expect(balanceOf(state.ledger, customerId)).toBe(150);

    state = { ...state, rewards: [reward()] };
    const r = redeemReward(state, { customerId, rewardId: "rw_1" }, NOW);
    expect(balanceOf(r.state.ledger, customerId)).toBe(50);
    expect(r.customerReward.status).toBe("available");
    expect(r.customerReward.code).toMatch(/^FDB-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(r.customerReward.pointsSpent).toBe(100);

    // ledger auditável: EARN +150, REDEEM -100
    expect(r.state.ledger.map((t) => [t.type, t.amount])).toEqual([
      ["EARN", 150],
      ["REDEEM", -100],
    ]);

    const used = markRewardUsed(r.state, r.customerReward.id, NOW);
    expect(used.customerRewards[0].status).toBe("used");
    expect(() => markRewardUsed(used, r.customerReward.id, NOW)).toThrow(DomainError);
  });

  it("não resgata sem saldo, sem estoque ou recompensa inativa", () => {
    const { state, customerId } = customerWithPoints();
    const go = (rw: LoyaltyReward) => () =>
      redeemReward({ ...state, rewards: [rw] }, { customerId, rewardId: rw.id }, NOW);
    expect(go(reward({ costPoints: 151 }))).toThrow("Pontos insuficientes");
    expect(go(reward({ stock: 0 }))).toThrow("esgotada");
    expect(go(reward({ active: false }))).toThrow("não está disponível");
  });

  it("estoque diminui a cada resgate", () => {
    const start = customerWithPoints();
    const customerId = start.customerId;
    let state = start.state;
    state = { ...state, rewards: [reward({ stock: 1, costPoints: 10 })] };
    state = redeemReward(state, { customerId, rewardId: "rw_1" }, NOW).state;
    expect(state.rewards[0].stock).toBe(0);
    expect(() => redeemReward(state, { customerId, rewardId: "rw_1" }, NOW)).toThrow("esgotada");
  });

  it("nível usa pontos acumulados: resgatar não rebaixa o cliente", () => {
    const start = customerWithPoints(freshState(), TUESDAY, 40000);
    const customerId = start.customerId;
    let state = start.state;
    state = { ...state, rewards: [reward({ costPoints: 300 })] };
    expect(loyaltySummary(state, customerId).level?.name).toBe("Prata"); // 400 ≥ 300
    state = redeemReward(state, { customerId, rewardId: "rw_1" }, NOW).state;
    const s = loyaltySummary(state, customerId);
    expect(s.balance).toBe(100);
    expect(s.level?.name).toBe("Prata");
  });
});

describe("ajustes manuais", () => {
  it("exige motivo e impede saldo negativo", () => {
    const { state, customerId } = customerWithPoints();
    expect(() => adjustPoints(state, { customerId, amount: 10, reason: " " }, NOW)).toThrow("motivo");
    expect(() => adjustPoints(state, { customerId, amount: -151, reason: "erro" }, NOW)).toThrow("negativo");
    const s = adjustPoints(state, { customerId, amount: -50, reason: "correção" }, NOW);
    expect(balanceOf(s.ledger, customerId)).toBe(100);
    expect(s.ledger.at(-1)?.type).toBe("ADJUSTMENT");
  });
});

describe("expiração de pontos", () => {
  it("expira pontos vencidos uma única vez (idempotente)", () => {
    let state = freshState();
    state = { ...state, settings: { ...state.settings, loyalty: { ...state.settings.loyalty, pointsValidityDays: 30 } } };
    const c = customerWithPoints(state);
    const later = NOW + 31 * DAY;
    expect(expirablePoints(c.state.ledger, c.customerId, NOW)).toBe(0);
    const r1 = runExpiration(c.state, later);
    expect(r1.expiredPoints).toBe(150);
    expect(balanceOf(r1.state.ledger, c.customerId)).toBe(0);
    const r2 = runExpiration(r1.state, later);
    expect(r2.expiredPoints).toBe(0);
    expect(r2.state.ledger).toHaveLength(2);
  });

  it("resgates consomem primeiro os pontos mais antigos (não expira o que já foi gasto)", () => {
    let state = freshState();
    state = {
      ...state,
      settings: { ...state.settings, loyalty: { ...state.settings.loyalty, pointsValidityDays: 30 } },
      rewards: [reward({ costPoints: 100 })],
    };
    const c = customerWithPoints(state); // +150 hoje, vence em 30 dias
    const redeemed = redeemReward(c.state, { customerId: c.customerId, rewardId: "rw_1" }, NOW).state; // -100
    const r = runExpiration(redeemed, NOW + 31 * DAY);
    expect(r.expiredPoints).toBe(50); // só os 50 que sobraram
    expect(balanceOf(r.state.ledger, c.customerId)).toBe(0);
  });

  it("benefícios fora da validade passam a 'expired' e não podem ser usados", () => {
    const start = customerWithPoints();
    const customerId = start.customerId;
    let state = start.state;
    state = { ...state, rewards: [reward({ costPoints: 10, validityDays: 5 })] };
    const r = redeemReward(state, { customerId, rewardId: "rw_1" }, NOW);
    const later = NOW + 6 * DAY;
    expect(() => markRewardUsed(r.state, r.customerReward.id, later)).toThrow("expirado");
    const ex = runExpiration(r.state, later);
    expect(ex.expiredRewards).toBe(1);
    expect(ex.state.customerRewards[0].status).toBe("expired");
  });
});

describe("regras configuráveis de pontos", () => {
  const loyalty = freshState().settings.loyalty;
  const args = { finalPriceCents: 5550, serviceBonus: 0, campaigns: [], at: NOW };

  it("arredondamento configurável", () => {
    expect(pointsForVisit({ ...args, loyalty: { ...loyalty, rounding: "floor" } }).total).toBe(55);
    expect(pointsForVisit({ ...args, loyalty: { ...loyalty, rounding: "round" } }).total).toBe(56);
    expect(pointsForVisit({ ...args, loyalty: { ...loyalty, rounding: "ceil" } }).total).toBe(56);
  });

  it("pontos por real, por visita e bônus do serviço somam", () => {
    const r = pointsForVisit({
      ...args,
      serviceBonus: 5,
      loyalty: { ...loyalty, pointsPerReal: 2, pointsPerVisit: 10 },
    });
    expect(r.total).toBe(111 + 10 + 5); // R$ 55,50 × 2 pontos = 111
  });

  it("modelo por visitas não gera pontos por gasto; desativado zera tudo", () => {
    expect(pointsForVisit({ ...args, loyalty: { ...loyalty, model: "visits" } }).total).toBe(0);
    expect(pointsForVisit({ ...args, loyalty: { ...loyalty, enabled: false } }).total).toBe(0);
  });

  it("campanha de multiplicador vigente (e só dentro da vigência)", () => {
    const camp = {
      id: "c1", businessId: "b", name: "Dobro", kind: "points_multiplier" as const,
      startsAt: new Date(NOW - DAY).toISOString(), endsAt: new Date(NOW + DAY).toISOString(),
      multiplier: 2, bonusPoints: null, segment: "all" as const, messageTemplate: "", active: true, sentToCustomerIds: [],
    };
    expect(pointsForVisit({ ...args, loyalty, campaigns: [camp] }).total).toBe(111); // 55,50 × 2
    expect(pointsForVisit({ ...args, loyalty, campaigns: [camp], at: NOW + 2 * DAY }).total).toBe(55);
  });
});

describe("recompensa por visitas", () => {
  it("entrega o benefício automaticamente na visita N (modelo visitas)", () => {
    let state = freshState();
    state = {
      ...state,
      rewards: [reward({ costPoints: 0 })],
      settings: {
        ...state.settings,
        loyalty: { ...state.settings.loyalty, model: "visits", visitsGoal: 2, visitsRewardId: "rw_1" },
      },
    };
    const days = ["2026-09-22", "2026-09-23"];
    for (const d of days) {
      const b = createBooking(state, { serviceId: "svc_pezinho", professionalId: "pro_henrique", startsAt: at(d, "10:00"), ...person(1) }, NOW);
      state = completeAppointment(b.state, { appointmentId: b.appointment.id, finalPriceCents: null }, NOW).state;
    }
    expect(state.customerRewards).toHaveLength(1);
    expect(state.customerRewards[0].source).toBe("visits");
    expect(state.ledger).toHaveLength(0); // modelo por visitas não mexe em pontos
  });
});

describe("indicação de amigos", () => {
  const withReferral = () => {
    const s = freshState();
    return {
      ...s,
      settings: {
        ...s.settings,
        loyalty: { ...s.settings.loyalty, referral: { enabled: true, referrerPoints: 50, refereePoints: 20, monthlyLimit: 1 } },
      },
    };
  };

  it("só libera pontos quando o indicado conclui o primeiro atendimento", () => {
    const first = customerWithPoints(withReferral());
    const referrer = first.state.customers[0];
    const b = createBooking(first.state, {
      serviceId: "svc_pezinho", professionalId: "pro_zorzin", startsAt: at(TUESDAY, "11:00"),
      ...person(2), referralCode: referrer.referralCode,
    }, NOW);
    expect(b.state.referrals[0].status).toBe("registered");
    expect(balanceOf(b.state.ledger, referrer.id)).toBe(150); // nada liberado ainda

    const done = completeAppointment(b.state, { appointmentId: b.appointment.id, finalPriceCents: null }, NOW).state;
    expect(done.referrals[0].status).toBe("qualified");
    expect(balanceOf(done.ledger, referrer.id)).toBe(150 + 50);
    expect(balanceOf(done.ledger, b.customer.id)).toBe(15 + 20);
  });

  it("não indica a si mesmo (WhatsApp já cadastrado) e respeita o limite mensal", () => {
    const first = customerWithPoints(withReferral());
    const referrer = first.state.customers[0];
    // mesmo cliente tentando usar o próprio código: não é cliente novo → sem indicação
    const self = createBooking(first.state, {
      serviceId: "svc_pezinho", professionalId: "pro_zorzin", startsAt: at(TUESDAY, "15:00"),
      ...person(1), referralCode: referrer.referralCode,
    }, NOW);
    expect(self.state.referrals).toHaveLength(0);

    let state = first.state;
    const refs: string[] = [];
    for (const n of [2, 3]) {
      const b = createBooking(state, {
        serviceId: "svc_pezinho", professionalId: "pro_zorzin", startsAt: at(TUESDAY, n === 2 ? "11:00" : "12:00"),
        ...person(n), referralCode: referrer.referralCode,
      }, NOW);
      state = completeAppointment(b.state, { appointmentId: b.appointment.id, finalPriceCents: null }, NOW).state;
      refs.push(state.referrals.at(-1)!.status);
    }
    expect(refs).toEqual(["qualified", "rejected"]);
  });
});

describe("aniversário", () => {
  it("concede bônus uma única vez por ano", () => {
    let state = freshState();
    state = { ...state, settings: { ...state.settings, loyalty: { ...state.settings.loyalty, birthdayBonusPoints: 30 } } };
    const b = createBooking(state, {
      serviceId: "svc_pezinho", professionalId: "pro_henrique", startsAt: at(TUESDAY, "10:00"),
      ...person(1), birthDate: "1990-09-21",
    }, NOW);
    const g1 = grantBirthdayBonuses(b.state, NOW);
    expect(g1.granted).toBe(1);
    expect(balanceOf(g1.state.ledger, b.customer.id)).toBe(30);
    const g2 = grantBirthdayBonuses(g1.state, NOW);
    expect(g2.granted).toBe(0);
  });
});

describe("dados de demonstração", () => {
  it("carrega e limpa sem deixar rastros", async () => {
    const { loadDemoData, clearDemoData } = await import("@/services/demo-data");
    const base = freshState();
    const loaded = loadDemoData(base, NOW);
    expect(loaded.customers.length).toBeGreaterThan(15);
    expect(loaded.customers.every((c) => c.isDemo)).toBe(true);
    expect(loaded.ledger.length).toBeGreaterThan(20);
    // nenhum double booking gerado pelo carregador
    const active = loaded.appointments.filter((a) => a.status !== "cancelled");
    for (const a of active) {
      const clash = active.filter(
        (b) => b.id !== a.id && b.professionalId === a.professionalId && a.startsAt < b.endsAt && b.startsAt < a.endsAt,
      );
      expect(clash).toHaveLength(0);
    }
    const cleared = clearDemoData(loaded);
    expect(cleared).toEqual(base);
  });
});
