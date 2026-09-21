import { describe, expect, it } from "vitest";
import {
  addCustomerNote,
  addBlock,
  createCustomer,
  deleteCustomer,
  deleteLevel,
  deleteProfessional,
  deleteService,
  grantReward,
  setHours,
  upsertLevel,
  upsertReward,
  updateCustomer,
} from "../admin";
import { adjustPoints, redeemReward } from "../loyalty";
import { completeAppointment, createBooking } from "../booking";
import { DomainError } from "../errors";
import { balanceOf } from "@/domain/loyalty";
import { computeSlots } from "@/domain/availability";
import { availabilityContext } from "../booking";
import { NOW, TUESDAY, at, freshState, person } from "./helpers";

const code = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof DomainError ? e.code : "OTHER";
  }
};

function withBooking() {
  const r = createBooking(
    freshState(),
    { serviceId: "svc_corte", professionalId: "pro_henrique", startsAt: at(TUESDAY, "14:00"), ...person(1), email: "", notes: "" },
    NOW,
  );
  return r;
}

describe("clientes (CRM)", () => {
  it("cadastra cliente, normaliza o WhatsApp e impede duplicidade", () => {
    const { state, customer } = createCustomer(freshState(), { name: "Ana Souza", whatsapp: "(19) 98888-7777", email: "", birthDate: "" }, NOW);
    expect(customer.whatsapp).toBe("5519988887777");
    expect(customer.referralCode).toMatch(/^ANA\d{3}$/);
    expect(code(() => createCustomer(state, { name: "Outra Ana", whatsapp: "19988887777", email: "", birthDate: "" }, NOW))).toBe("CONFLICT");
    expect(code(() => createCustomer(state, { name: "X", whatsapp: "123", email: "", birthDate: "" }, NOW))).toBe("VALIDATION");
  });

  it("edita cliente sem permitir WhatsApp de outro cadastro", () => {
    const a = createCustomer(freshState(), { name: "Ana", whatsapp: "19988887777", email: "", birthDate: "" }, NOW);
    const b = createCustomer(a.state, { name: "Bia", whatsapp: "19977776666", email: "", birthDate: "" }, NOW);
    expect(code(() => updateCustomer(b.state, b.customer.id, { whatsapp: "19988887777" }))).toBe("CONFLICT");
    const ok = updateCustomer(b.state, b.customer.id, { name: "Beatriz" });
    expect(ok.customers.find((c) => c.id === b.customer.id)?.name).toBe("Beatriz");
  });

  it("observações internas exigem texto e ficam na lista do cliente", () => {
    const { state, customer } = createCustomer(freshState(), { name: "Ana", whatsapp: "19988887777", email: "", birthDate: "" }, NOW);
    expect(code(() => addCustomerNote(state, customer.id, "   ", NOW))).toBe("VALIDATION");
    const s = addCustomerNote(state, customer.id, "Prefere máquina 2", NOW);
    expect(s.customerNotes).toHaveLength(1);
  });

  it("excluir cliente (LGPD) remove agendamentos, pontos, benefícios e observações — e só dele", () => {
    const r = withBooking();
    let s = completeAppointment(r.state, { appointmentId: r.appointment.id, finalPriceCents: 5000 }, NOW).state;
    s = addCustomerNote(s, r.customer.id, "nota", NOW);
    s = upsertReward(s, { id: "rw1", businessId: s.business.id, name: "R", description: "", kind: "other", costPoints: 10, validityDays: null, stock: null, active: true, isDemo: false });
    s = redeemReward(s, { customerId: r.customer.id, rewardId: "rw1" }, NOW).state;
    const other = createCustomer(s, { name: "Outro", whatsapp: "19977776666", email: "", birthDate: "" }, NOW);
    s = adjustPoints(other.state, { customerId: other.customer.id, amount: 30, reason: "teste" }, NOW);

    const after = deleteCustomer(s, r.customer.id);
    expect(after.customers.map((c) => c.id)).toEqual([other.customer.id]);
    expect(after.appointments).toHaveLength(0);
    expect(after.statusHistory).toHaveLength(0);
    expect(after.customerNotes).toHaveLength(0);
    expect(after.customerRewards).toHaveLength(0);
    expect(after.ledger.every((t) => t.customerId === other.customer.id)).toBe(true);
    expect(balanceOf(after.ledger, other.customer.id)).toBe(30);
    // o horário volta a ficar livre
    const ctx = availabilityContext(after, NOW);
    const slots = computeSlots(ctx, TUESDAY, after.services.find((x) => x.id === "svc_corte")!, [after.professionals.find((p) => p.id === "pro_henrique")!]);
    expect(slots.some((x) => x.startsAt === at(TUESDAY, "14:00"))).toBe(true);
  });

  it("cortesia da equipe emite benefício sem gastar pontos", () => {
    const r = withBooking();
    let s = upsertReward(r.state, { id: "rw1", businessId: r.state.business.id, name: "Brinde", description: "", kind: "other", costPoints: 500, validityDays: 30, stock: null, active: true, isDemo: false });
    s = grantReward(s, r.customer.id, "rw1", NOW);
    expect(s.customerRewards).toHaveLength(1);
    expect(s.customerRewards[0]).toMatchObject({ source: "admin", pointsSpent: 0, status: "available" });
    expect(balanceOf(s.ledger, r.customer.id)).toBe(0);
  });
});

describe("cadastros e integridade", () => {
  it("não exclui serviço nem profissional com histórico (pede para desativar)", () => {
    const r = withBooking();
    expect(code(() => deleteService(r.state, "svc_corte"))).toBe("CONFLICT");
    expect(code(() => deleteProfessional(r.state, "pro_henrique"))).toBe("CONFLICT");
    expect(code(() => deleteService(freshState(), "svc_corte"))).toBeNull();
  });

  it("valida expediente: fechamento depois da abertura e sem janelas sobrepostas", () => {
    const s = freshState();
    expect(code(() => setHours(s, null, [{ weekday: 1, opensMin: 600, closesMin: 600 }]))).toBe("VALIDATION");
    expect(code(() => setHours(s, null, [
      { weekday: 1, opensMin: 540, closesMin: 720 },
      { weekday: 1, opensMin: 700, closesMin: 900 },
    ]))).toBe("VALIDATION");
    const ok = setHours(s, null, [
      { weekday: 1, opensMin: 540, closesMin: 720 },
      { weekday: 1, opensMin: 810, closesMin: 1080 },
    ]);
    expect(ok.hours.filter((h) => h.professionalId === null)).toHaveLength(2);
  });

  it("intervalo no expediente remove os horários do almoço da agenda", () => {
    let s = setHours(freshState(), null, [
      { weekday: 2, opensMin: 540, closesMin: 720 },
      { weekday: 2, opensMin: 840, closesMin: 1080 },
    ]);
    s = { ...s, hours: s.hours.filter((h) => h.professionalId === null) };
    const ctx = availabilityContext(s, NOW);
    const svc = s.services.find((x) => x.id === "svc_corte")!;
    const slots = computeSlots(ctx, TUESDAY, svc, [s.professionals.find((p) => p.id === "pro_henrique")!]);
    const mins = slots.map((x) => x.startMin);
    expect(mins).toContain(540);
    expect(mins.some((m) => m >= 720 && m < 840)).toBe(false);
    expect(mins).toContain(840);
  });

  it("bloqueio da barbearia inteira tira os horários do dia", () => {
    const s = addBlock(freshState(), {
      professionalId: null,
      startsAt: at(TUESDAY, "00:00"),
      endsAt: at("2026-09-23", "00:00"),
      kind: "holiday",
      reason: "Feriado",
    });
    const ctx = availabilityContext(s, NOW);
    const svc = s.services.find((x) => x.id === "svc_corte")!;
    expect(computeSlots(ctx, TUESDAY, svc, s.professionals.filter((p) => p.active))).toHaveLength(0);
  });

  it("níveis: pontuação única e ao menos um nível", () => {
    const s = freshState();
    const lv = s.levels[1];
    expect(code(() => upsertLevel(s, { ...lv, id: "novo", minPoints: s.levels[2].minPoints }))).toBe("VALIDATION");
    let cur = s;
    for (const l of s.levels.slice(1)) cur = deleteLevel(cur, l.id);
    expect(code(() => deleteLevel(cur, cur.levels[0].id))).toBe("CONFLICT");
  });
});
