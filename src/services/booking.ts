/**
 * Serviços de agendamento. Toda regra de negócio vive aqui (nunca no componente).
 * Nunca confiamos no que o cliente envia: preço, duração, profissional elegível
 * e disponibilidade são SEMPRE recalculados a partir do estado.
 * No backend real, cada função vira uma RPC/transaction (ver supabase/migrations).
 */
import { z } from "zod";
import {
  SLOT_OCCUPYING_STATUSES,
  type Appointment,
  type AppointmentStatus,
  type Customer,
  type DataState,
  type Professional,
} from "@/types";
import {
  REJECTION_MESSAGES,
  evaluateSlot,
  pickProfessional,
  type AvailabilityContext,
} from "@/domain/availability";
import { priceFor } from "@/domain/pricing";
import { addMinutesISO, overlaps, toLocalParts } from "@/domain/time";
import { bookingSchema, fieldErrors, type BookingInput } from "@/schemas";
import { newId, referralCodeFor, secureToken } from "@/utils/ids";
import { DomainError } from "./errors";
import { awardVisitPoints, grantVisitReward, qualifyReferral } from "./loyalty";

export function availabilityContext(state: DataState, now: number): AvailabilityContext {
  return {
    hours: state.hours,
    blocks: state.blocks,
    appointments: state.appointments,
    settings: state.settings,
    now,
  };
}

function addHistory(
  state: DataState,
  appointmentId: string,
  from: AppointmentStatus | null,
  to: AppointmentStatus,
  actor: "customer" | "admin" | "system",
  note: string,
  now: number,
): DataState {
  return {
    ...state,
    statusHistory: [
      ...state.statusHistory,
      {
        id: newId("ash"),
        appointmentId,
        fromStatus: from,
        toStatus: to,
        actor,
        note,
        createdAt: new Date(now).toISOString(),
      },
    ],
  };
}

export function eligibleProfessionals(state: DataState, serviceId: string): Professional[] {
  return state.professionals
    .filter(
      (p) => p.active && (p.serviceIds.length === 0 || p.serviceIds.includes(serviceId)),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export interface CreateBookingResult {
  state: DataState;
  appointment: Appointment;
  customer: Customer;
  isNewCustomer: boolean;
}

/** Cria (ou localiza) o cliente pelo WhatsApp e registra o agendamento. */
export function createBooking(
  state: DataState,
  raw: BookingInput,
  now: number,
  opts: { source?: "site" | "admin" } = {},
): CreateBookingResult {
  const source = opts.source ?? "site";
  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DomainError("VALIDATION", "Confira os dados informados.", fieldErrors(parsed.error));
  }
  const input = parsed.data;

  const service = state.services.find((s) => s.id === input.serviceId && s.active);
  if (!service) throw new DomainError("NOT_FOUND", "Serviço indisponível.");

  const ctx = availabilityContext(state, now);
  const slotOpts = { ignoreNotice: source === "admin", requireGrid: source === "site" };

  // Escolha do profissional (nunca vem "pronto" do cliente para o caso "qualquer").
  let professional: Professional | null = null;
  if (input.professionalId === "any") {
    const free = eligibleProfessionals(state, service.id).filter(
      (p) => evaluateSlot(ctx, p, service, input.startsAt, slotOpts) === null,
    );
    professional = pickProfessional(free, state.appointments, input.startsAt);
    if (!professional) {
      throw new DomainError("SLOT_UNAVAILABLE", REJECTION_MESSAGES.conflict);
    }
  } else {
    professional =
      state.professionals.find((p) => p.id === input.professionalId && p.active) ?? null;
    if (!professional) throw new DomainError("NOT_FOUND", "Profissional indisponível.");
    const reason = evaluateSlot(ctx, professional, service, input.startsAt, slotOpts);
    if (reason) throw new DomainError("SLOT_UNAVAILABLE", REJECTION_MESSAGES[reason]);
  }

  // Cliente: localizar por WhatsApp ou criar.
  let next = state;
  let customer = next.customers.find((c) => c.whatsapp === input.whatsapp) ?? null;
  const isNewCustomer = customer === null;
  const endsAt = addMinutesISO(input.startsAt, service.durationMinutes);

  if (customer) {
    const overlapping = next.appointments.some(
      (a) =>
        a.customerId === customer!.id &&
        SLOT_OCCUPYING_STATUSES.includes(a.status) &&
        a.status !== "completed" &&
        overlaps(input.startsAt, endsAt, a.startsAt, a.endsAt),
    );
    if (overlapping) {
      throw new DomainError(
        "CUSTOMER_OVERLAP",
        "Você já tem um horário marcado nesse período.",
      );
    }
    const updated: Customer = {
      ...customer,
      email: customer.email ?? input.email,
      birthDate: customer.birthDate ?? input.birthDate,
    };
    customer = updated;
    next = { ...next, customers: next.customers.map((c) => (c.id === updated.id ? updated : c)) };
  } else {
    const taken = new Set(next.customers.map((c) => c.referralCode));
    const referrer = input.referralCode
      ? next.customers.find((c) => c.referralCode === input.referralCode!.toUpperCase())
      : undefined;
    const created: Customer = {
      id: newId("cus"),
      businessId: next.business.id,
      name: input.name,
      whatsapp: input.whatsapp,
      email: input.email,
      birthDate: input.birthDate,
      referralCode: referralCodeFor(input.name, taken),
      referredByCustomerId: referrer?.id ?? null,
      createdAt: new Date(now).toISOString(),
      isDemo: false,
    };
    customer = created;
    next = { ...next, customers: [...next.customers, created] };
    if (referrer && next.settings.loyalty.referral.enabled) {
      const referralId = newId("ref");
      next = {
        ...next,
        referrals: [
          ...next.referrals,
          {
            id: referralId,
            businessId: next.business.id,
            referrerId: referrer.id,
            refereeId: created.id,
            status: "registered",
            createdAt: new Date(now).toISOString(),
          },
        ],
        referralEvents: [
          ...next.referralEvents,
          {
            id: newId("rev"),
            referralId,
            type: "registered",
            points: 0,
            note: "Novo cliente chegou por indicação.",
            createdAt: new Date(now).toISOString(),
          },
        ],
      };
    }
  }

  const weekday = toLocalParts(input.startsAt).weekday;
  const status: AppointmentStatus =
    source === "admin" || next.settings.autoConfirm ? "confirmed" : "pending";
  const appointment: Appointment = {
    id: newId("apt"),
    businessId: next.business.id,
    customerId: customer.id,
    professionalId: professional.id,
    serviceId: service.id,
    serviceName: service.name,
    durationMinutes: service.durationMinutes,
    startsAt: input.startsAt,
    endsAt,
    status,
    priceCents: priceFor(service, weekday),
    priceIsStartingAt: service.priceIsStartingAt && priceFor(service, weekday) === service.priceCents,
    finalPriceCents: null,
    customerNotes: input.notes ?? "",
    manageToken: secureToken(),
    source,
    createdAt: new Date(now).toISOString(),
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
    rescheduledFromStartsAt: null,
    pointsAwarded: 0,
  };

  // Última barreira contra double booking (espelha a exclusion constraint do banco).
  const clash = next.appointments.some(
    (a) =>
      a.professionalId === appointment.professionalId &&
      SLOT_OCCUPYING_STATUSES.includes(a.status) &&
      overlaps(appointment.startsAt, appointment.endsAt, a.startsAt, a.endsAt),
  );
  if (clash) throw new DomainError("SLOT_UNAVAILABLE", REJECTION_MESSAGES.conflict);

  next = { ...next, appointments: [...next.appointments, appointment] };
  next = addHistory(next, appointment.id, null, status, source === "admin" ? "admin" : "customer", "Agendamento criado", now);
  return { state: next, appointment, customer, isNewCustomer };
}

type Actor =
  | { kind: "admin" }
  | { kind: "customer"; customerId?: string; token?: string };

function findAppointment(state: DataState, id: string): Appointment {
  const a = state.appointments.find((x) => x.id === id);
  if (!a) throw new DomainError("NOT_FOUND", "Agendamento não encontrado.");
  return a;
}

/** Cliente só mexe no que é dele (dono pelo login ou token secreto do link). */
function assertCanManage(a: Appointment, actor: Actor, state: DataState, now: number) {
  if (actor.kind === "admin") return;
  const owns =
    (actor.customerId && a.customerId === actor.customerId) ||
    (actor.token && actor.token === a.manageToken);
  if (!owns) throw new DomainError("FORBIDDEN", "Você não tem acesso a este agendamento.");
  const limitMs = state.settings.customerChangeLimitHours * 3_600_000;
  if (new Date(a.startsAt).getTime() - now < limitMs) {
    throw new DomainError(
      "TOO_LATE",
      `Cancelamentos e remarcações são permitidos até ${state.settings.customerChangeLimitHours}h antes. Fale com a barbearia pelo WhatsApp.`,
    );
  }
}

export function cancelAppointment(
  state: DataState,
  args: { appointmentId: string; actor: Actor; reason?: string },
  now: number,
): DataState {
  const a = findAppointment(state, args.appointmentId);
  if (a.status !== "pending" && a.status !== "confirmed") {
    throw new DomainError("INVALID_STATUS", "Este agendamento não pode mais ser cancelado.");
  }
  assertCanManage(a, args.actor, state, now);
  const iso = new Date(now).toISOString();
  const next: DataState = {
    ...state,
    appointments: state.appointments.map((x) =>
      x.id === a.id
        ? { ...x, status: "cancelled", cancelledAt: iso, cancelReason: args.reason?.trim() || null }
        : x,
    ),
  };
  return addHistory(next, a.id, a.status, "cancelled", args.actor.kind, args.reason?.trim() || "Cancelado", now);
}

export function rescheduleAppointment(
  state: DataState,
  args: { appointmentId: string; newStartsAt: string; newProfessionalId?: string; actor: Actor },
  now: number,
): { state: DataState; appointment: Appointment } {
  const a = findAppointment(state, args.appointmentId);
  if (a.status !== "pending" && a.status !== "confirmed") {
    throw new DomainError("INVALID_STATUS", "Este agendamento não pode ser remarcado.");
  }
  assertCanManage(a, args.actor, state, now);
  const service = state.services.find((s) => s.id === a.serviceId);
  if (!service) throw new DomainError("NOT_FOUND", "Serviço indisponível.");

  const ctx = availabilityContext(state, now);
  const isAdmin = args.actor.kind === "admin";
  const opts = {
    ignoreNotice: isAdmin,
    requireGrid: !isAdmin,
    excludeAppointmentId: a.id,
  };

  let professional: Professional | null = null;
  const wanted = args.newProfessionalId ?? a.professionalId;
  if (wanted === "any") {
    const free = eligibleProfessionals(state, service.id).filter(
      (p) => evaluateSlot(ctx, p, service, args.newStartsAt, opts) === null,
    );
    professional = pickProfessional(free, state.appointments, args.newStartsAt);
    if (!professional) throw new DomainError("SLOT_UNAVAILABLE", REJECTION_MESSAGES.conflict);
  } else {
    professional = state.professionals.find((p) => p.id === wanted && p.active) ?? null;
    if (!professional) throw new DomainError("NOT_FOUND", "Profissional indisponível.");
    const reason = evaluateSlot(ctx, professional, service, args.newStartsAt, opts);
    if (reason) throw new DomainError("SLOT_UNAVAILABLE", REJECTION_MESSAGES[reason]);
  }

  const weekday = toLocalParts(args.newStartsAt).weekday;
  const newPrice = priceFor(service, weekday);
  const updated: Appointment = {
    ...a,
    professionalId: professional.id,
    startsAt: args.newStartsAt,
    endsAt: addMinutesISO(args.newStartsAt, a.durationMinutes),
    priceCents: newPrice,
    priceIsStartingAt: service.priceIsStartingAt && newPrice === service.priceCents,
    rescheduledFromStartsAt: a.startsAt,
  };
  let next: DataState = {
    ...state,
    appointments: state.appointments.map((x) => (x.id === a.id ? updated : x)),
  };
  next = addHistory(next, a.id, a.status, a.status, args.actor.kind, "Remarcado", now);
  return { state: next, appointment: updated };
}

export function confirmAppointment(state: DataState, appointmentId: string, now: number): DataState {
  const a = findAppointment(state, appointmentId);
  if (a.status !== "pending") throw new DomainError("INVALID_STATUS", "Só agendamentos pendentes podem ser confirmados.");
  const next = {
    ...state,
    appointments: state.appointments.map((x) => (x.id === a.id ? { ...x, status: "confirmed" as const } : x)),
  };
  return addHistory(next, a.id, a.status, "confirmed", "admin", "Confirmado pela equipe", now);
}

export function markNoShow(state: DataState, appointmentId: string, now: number): DataState {
  const a = findAppointment(state, appointmentId);
  if (a.status !== "pending" && a.status !== "confirmed") {
    throw new DomainError("INVALID_STATUS", "Só é possível marcar falta em agendamentos ativos.");
  }
  const next = {
    ...state,
    appointments: state.appointments.map((x) => (x.id === a.id ? { ...x, status: "no_show" as const } : x)),
  };
  return addHistory(next, a.id, a.status, "no_show", "admin", "Cliente não compareceu", now);
}

const completeSchema = z.object({
  appointmentId: z.string().min(1),
  finalPriceCents: z.number().int().min(0).max(1_000_000).nullable(),
});

/**
 * Conclui o atendimento e registra, numa única transição:
 * visita + valor cobrado + pontos (ledger) + recompensa por visitas + indicação.
 * Idempotente: concluir duas vezes não gera pontos duas vezes.
 */
export function completeAppointment(
  state: DataState,
  args: { appointmentId: string; finalPriceCents: number | null },
  now: number,
): { state: DataState; appointment: Appointment; pointsAwarded: number } {
  const parsed = completeSchema.safeParse(args);
  if (!parsed.success) throw new DomainError("VALIDATION", "Valor inválido.", fieldErrors(parsed.error));
  const a = findAppointment(state, args.appointmentId);
  if (a.status !== "pending" && a.status !== "confirmed") {
    throw new DomainError("INVALID_STATUS", "Só é possível concluir agendamentos ativos.");
  }
  const finalPrice = args.finalPriceCents ?? a.priceCents;
  if (finalPrice === null) {
    throw new DomainError("PRICE_REQUIRED", "Informe o valor cobrado para concluir este atendimento.");
  }

  const completed: Appointment = {
    ...a,
    status: "completed",
    finalPriceCents: finalPrice,
    completedAt: new Date(now).toISOString(),
  };
  let next: DataState = {
    ...state,
    appointments: state.appointments.map((x) => (x.id === a.id ? completed : x)),
  };
  next = addHistory(next, a.id, a.status, "completed", "admin", "Atendimento concluído", now);

  const award = awardVisitPoints(next, completed, finalPrice, now);
  next = award.state;
  const finalAppointment: Appointment = { ...completed, pointsAwarded: award.points };
  next = {
    ...next,
    appointments: next.appointments.map((x) => (x.id === a.id ? finalAppointment : x)),
  };

  const visits = next.appointments.filter(
    (x) => x.customerId === a.customerId && x.status === "completed",
  ).length;
  next = grantVisitReward(next, a.customerId, visits, now);
  next = qualifyReferral(next, a.customerId, visits, now);
  return { state: next, appointment: finalAppointment, pointsAwarded: award.points };
}
