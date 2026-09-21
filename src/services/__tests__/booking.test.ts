import { describe, expect, it } from "vitest";
import { DomainError } from "@/services/errors";
import {
  cancelAppointment,
  completeAppointment,
  createBooking,
  markNoShow,
  rescheduleAppointment,
} from "@/services/booking";
import { computeSlots } from "@/domain/availability";
import { availabilityContext } from "@/services/booking";
import { NOW, SUNDAY, TUESDAY, at, freshState, person } from "./helpers";

const base = (n: number, over: Record<string, unknown> = {}) => ({
  serviceId: "svc_corte",
  professionalId: "pro_henrique",
  startsAt: at(TUESDAY, "14:00"),
  ...person(n),
  ...over,
});

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    expect((e as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`esperava DomainError ${code}`);
}

describe("agendamento", () => {
  it("cria agendamento com preço calculado no servidor (terça = R$ 55)", () => {
    const { appointment, isNewCustomer, state } = createBooking(freshState(), base(1), NOW);
    expect(isNewCustomer).toBe(true);
    expect(appointment.priceCents).toBe(5500);
    expect(appointment.priceIsStartingAt).toBe(false);
    expect(appointment.status).toBe("confirmed");
    expect(state.statusHistory).toHaveLength(1);
  });

  it("ignora qualquer preço enviado pelo cliente (anti-manipulação)", () => {
    const { appointment } = createBooking(
      freshState(),
      base(1, { priceCents: 1, price: 1, durationMinutes: 1 }),
      NOW,
    );
    expect(appointment.priceCents).toBe(5500);
    expect(appointment.durationMinutes).toBe(45);
  });

  it("BLOQUEIA double booking: cliente A reserva 14:00, cliente B não consegue", () => {
    const a = createBooking(freshState(), base(1), NOW);
    expectCode(() => createBooking(a.state, base(2), NOW), "SLOT_UNAVAILABLE");
  });

  it("bloqueia sobreposição parcial (B às 14:30 com A em 14:00–14:45)", () => {
    const a = createBooking(freshState(), base(1), NOW);
    expectCode(
      () => createBooking(a.state, base(2, { startsAt: at(TUESDAY, "14:30") }), NOW),
      "SLOT_UNAVAILABLE",
    );
  });

  it("permite o mesmo horário com outro profissional", () => {
    const a = createBooking(freshState(), base(1), NOW);
    const b = createBooking(a.state, base(2, { professionalId: "pro_zorzin" }), NOW);
    expect(b.appointment.professionalId).toBe("pro_zorzin");
  });

  it("'qualquer profissional' distribui e nunca escolhe quem está ocupado", () => {
    let state = freshState();
    const chosen: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const r = createBooking(state, base(i, { professionalId: "any" }), NOW);
      state = r.state;
      chosen.push(r.appointment.professionalId);
    }
    expect(new Set(chosen).size).toBe(3);
    expectCode(() => createBooking(state, base(4, { professionalId: "any" }), NOW), "SLOT_UNAVAILABLE");
  });

  it("rejeita domingo (fechado), fora do expediente e passado", () => {
    const s = freshState();
    expectCode(() => createBooking(s, base(1, { startsAt: at(SUNDAY, "10:00") }), NOW), "SLOT_UNAVAILABLE");
    expectCode(() => createBooking(s, base(1, { startsAt: at(TUESDAY, "20:00") }), NOW), "SLOT_UNAVAILABLE");
    expectCode(() => createBooking(s, base(1, { startsAt: at("2026-09-21", "09:00") }), NOW), "SLOT_UNAVAILABLE");
  });

  it("respeita antecedência mínima e janela de reserva", () => {
    const s = freshState();
    expectCode(() => createBooking(s, base(1, { startsAt: at("2026-09-21", "10:30") }), NOW), "SLOT_UNAVAILABLE");
    expectCode(() => createBooking(s, base(1, { startsAt: at("2026-11-10", "10:00") }), NOW), "SLOT_UNAVAILABLE");
  });

  it("respeita bloqueios (folga/férias do profissional e da barbearia)", () => {
    let s = freshState();
    s = {
      ...s,
      blocks: [
        {
          id: "b1",
          businessId: s.business.id,
          professionalId: "pro_henrique",
          startsAt: at(TUESDAY, "13:00"),
          endsAt: at(TUESDAY, "16:00"),
          kind: "block",
          reason: "Folga",
        },
      ],
    };
    expectCode(() => createBooking(s, base(1), NOW), "SLOT_UNAVAILABLE");
    expect(createBooking(s, base(1, { professionalId: "pro_zorzin" }), NOW).appointment).toBeTruthy();
  });

  it("valida dados: WhatsApp e e-mail inválidos", () => {
    try {
      createBooking(freshState(), base(1, { whatsapp: "123", email: "x" }), NOW);
      throw new Error("deveria falhar");
    } catch (e) {
      expect((e as DomainError).code).toBe("VALIDATION");
      expect((e as DomainError).fields).toHaveProperty("whatsapp");
      expect((e as DomainError).fields).toHaveProperty("email");
    }
  });

  it("reaproveita o cliente existente pelo WhatsApp (sem duplicar)", () => {
    const a = createBooking(freshState(), base(1), NOW);
    const b = createBooking(a.state, base(1, { startsAt: at(TUESDAY, "16:00") }), NOW);
    expect(b.isNewCustomer).toBe(false);
    expect(b.state.customers).toHaveLength(1);
  });

  it("impede o mesmo cliente de marcar dois horários sobrepostos", () => {
    const a = createBooking(freshState(), base(1), NOW);
    expectCode(
      () => createBooking(a.state, base(1, { professionalId: "pro_zorzin" }), NOW),
      "CUSTOMER_OVERLAP",
    );
  });

  it("horários livres não incluem o ocupado", () => {
    const a = createBooking(freshState(), base(1), NOW);
    const svc = a.state.services.find((s) => s.id === "svc_corte")!;
    const pro = a.state.professionals.filter((p) => p.id === "pro_henrique");
    const slots = computeSlots(availabilityContext(a.state, NOW), TUESDAY, svc, pro);
    const starts = slots.map((s) => s.startMin);
    expect(starts).not.toContain(14 * 60);
    expect(starts).not.toContain(14 * 60 + 30); // ainda dentro de 14:00–14:45
    expect(starts).toContain(15 * 60);
  });
});

describe("cancelamento e remarcação", () => {
  const booked = () => createBooking(freshState(), base(1), NOW);

  it("cancela e libera o horário para outro cliente", () => {
    const a = booked();
    const s = cancelAppointment(
      a.state,
      { appointmentId: a.appointment.id, actor: { kind: "customer", token: a.appointment.manageToken } },
      NOW,
    );
    expect(s.appointments[0].status).toBe("cancelled");
    expect(createBooking(s, base(2), NOW).appointment).toBeTruthy();
  });

  it("não deixa terceiros cancelarem (token/ID errado)", () => {
    const a = booked();
    expectCode(
      () =>
        cancelAppointment(a.state, { appointmentId: a.appointment.id, actor: { kind: "customer", token: "errado" } }, NOW),
      "FORBIDDEN",
    );
    expectCode(
      () =>
        cancelAppointment(a.state, { appointmentId: a.appointment.id, actor: { kind: "customer", customerId: "outro" } }, NOW),
      "FORBIDDEN",
    );
  });

  it("cliente não cancela em cima da hora; admin pode", () => {
    const a = booked();
    const lateNow = new Date(at(TUESDAY, "13:00")).getTime();
    expectCode(
      () =>
        cancelAppointment(
          a.state,
          { appointmentId: a.appointment.id, actor: { kind: "customer", token: a.appointment.manageToken } },
          lateNow,
        ),
      "TOO_LATE",
    );
    expect(
      cancelAppointment(a.state, { appointmentId: a.appointment.id, actor: { kind: "admin" } }, lateNow)
        .appointments[0].status,
    ).toBe("cancelled");
  });

  it("remarca para outro horário livre e mantém histórico", () => {
    const a = booked();
    const r = rescheduleAppointment(
      a.state,
      {
        appointmentId: a.appointment.id,
        newStartsAt: at("2026-09-24", "10:00"),
        actor: { kind: "customer", token: a.appointment.manageToken },
      },
      NOW,
    );
    expect(r.appointment.startsAt).toBe(at("2026-09-24", "10:00"));
    expect(r.appointment.rescheduledFromStartsAt).toBe(at(TUESDAY, "14:00"));
    // quinta: sem promoção de terça/quarta → preço cheio
    expect(r.appointment.priceCents).toBe(6000);
    expect(r.state.statusHistory).toHaveLength(2);
  });

  it("remarcação não pode cair em horário ocupado", () => {
    const a = booked();
    const b = createBooking(a.state, base(2, { startsAt: at(TUESDAY, "16:00") }), NOW);
    expectCode(
      () =>
        rescheduleAppointment(
          b.state,
          { appointmentId: b.appointment.id, newStartsAt: at(TUESDAY, "14:00"), actor: { kind: "admin" } },
          NOW,
        ),
      "SLOT_UNAVAILABLE",
    );
  });

  it("remarcar para o mesmo intervalo do próprio agendamento é permitido", () => {
    const a = booked();
    const r = rescheduleAppointment(
      a.state,
      { appointmentId: a.appointment.id, newStartsAt: at(TUESDAY, "14:30"), actor: { kind: "admin" } },
      NOW,
    );
    expect(r.appointment.startsAt).toBe(at(TUESDAY, "14:30"));
  });

  it("falta (no-show) só muda o status e não gera pontos", () => {
    const a = booked();
    const s = markNoShow(a.state, a.appointment.id, NOW);
    expect(s.appointments[0].status).toBe("no_show");
    expect(s.ledger).toHaveLength(0);
  });
});

describe("conclusão do atendimento", () => {
  it("registra visita, valor e pontos automaticamente e é idempotente", () => {
    const a = createBooking(freshState(), base(1), NOW);
    const done = completeAppointment(a.state, { appointmentId: a.appointment.id, finalPriceCents: null }, NOW);
    expect(done.appointment.status).toBe("completed");
    expect(done.appointment.finalPriceCents).toBe(5500);
    expect(done.pointsAwarded).toBe(55); // 1 ponto por R$ 1 (padrão editável)
    expect(done.state.ledger).toHaveLength(1);
    expectCode(
      () => completeAppointment(done.state, { appointmentId: a.appointment.id, finalPriceCents: null }, NOW),
      "INVALID_STATUS",
    );
    expect(done.state.ledger).toHaveLength(1);
  });

  it("usa o valor cobrado informado (serviço 'a partir de')", () => {
    const a = createBooking(freshState(), base(1, { startsAt: at("2026-09-24", "10:00") }), NOW);
    const done = completeAppointment(a.state, { appointmentId: a.appointment.id, finalPriceCents: 7250 }, NOW);
    expect(done.pointsAwarded).toBe(72); // floor(72,50)
  });
});
