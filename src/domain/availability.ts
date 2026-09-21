/**
 * Disponibilidade de agenda: fonte única de verdade para
 *  - listar horários livres (site e admin);
 *  - validar uma reserva (createBooking) e impedir double booking.
 *
 * Funções puras: recebem o estado e o "agora" por parâmetro.
 */
import {
  SLOT_OCCUPYING_STATUSES,
  type Appointment,
  type BlockedPeriod,
  type BusinessHour,
  type BusinessSettings,
  type Professional,
  type Service,
  type Slot,
} from "@/types";
import {
  addDays,
  addMinutesISO,
  diffDays,
  fromLocal,
  overlaps,
  todayLocal,
  toLocalParts,
  weekdayOf,
} from "./time";

export type SlotRejection =
  | "past"
  | "too_soon"
  | "too_far"
  | "not_offered"
  | "outside_hours"
  | "blocked"
  | "conflict"
  | "off_grid";

export interface AvailabilityContext {
  hours: BusinessHour[];
  blocks: BlockedPeriod[];
  appointments: Appointment[];
  settings: Pick<
    BusinessSettings,
    "minNoticeMinutes" | "bookingWindowDays" | "slotIntervalMinutes"
  >;
  now: number;
}

export interface SlotOptions {
  /** Admin: ignora antecedência mínima e janela de reserva (não ignora conflitos). */
  ignoreNotice?: boolean;
  /** Ao remarcar, o próprio agendamento não conta como conflito. */
  excludeAppointmentId?: string;
}

/** Janelas de trabalho do profissional em determinada data. */
export function workWindows(
  hours: BusinessHour[],
  professionalId: string,
  date: string,
): Array<{ opensMin: number; closesMin: number }> {
  const weekday = weekdayOf(date);
  const own = hours.filter((h) => h.professionalId === professionalId);
  const source = own.length > 0 ? own : hours.filter((h) => h.professionalId === null);
  return source
    .filter((h) => h.weekday === weekday && h.closesMin > h.opensMin)
    .sort((a, b) => a.opensMin - b.opensMin);
}

/** Motivo pelo qual um início específico NÃO pode ser reservado (ou null). */
export function evaluateSlot(
  ctx: AvailabilityContext,
  professional: Professional,
  service: Service,
  startsAt: string,
  opts: SlotOptions & { requireGrid?: boolean } = {},
): SlotRejection | null {
  const start = new Date(startsAt).getTime();
  const durationMs = service.durationMinutes * 60_000;
  const local = toLocalParts(startsAt);

  if (professional.serviceIds.length > 0 && !professional.serviceIds.includes(service.id)) {
    return "not_offered";
  }
  if (!opts.ignoreNotice) {
    if (start < ctx.now) return "past";
    if (start < ctx.now + ctx.settings.minNoticeMinutes * 60_000) return "too_soon";
    if (diffDays(todayLocal(ctx.now), local.date) > ctx.settings.bookingWindowDays) {
      return "too_far";
    }
  }

  const windows = workWindows(ctx.hours, professional.id, local.date);
  const inside = windows.find(
    (w) => local.minutes >= w.opensMin && local.minutes + service.durationMinutes <= w.closesMin,
  );
  if (!inside) return "outside_hours";

  if (opts.requireGrid) {
    const step = ctx.settings.slotIntervalMinutes;
    if ((local.minutes - inside.opensMin) % step !== 0) return "off_grid";
  }

  const blocked = ctx.blocks.some(
    (b) =>
      (b.professionalId === null || b.professionalId === professional.id) &&
      overlaps(start, start + durationMs, b.startsAt, b.endsAt),
  );
  if (blocked) return "blocked";

  const conflict = ctx.appointments.some(
    (a) =>
      a.professionalId === professional.id &&
      a.id !== opts.excludeAppointmentId &&
      SLOT_OCCUPYING_STATUSES.includes(a.status) &&
      overlaps(start, start + durationMs, a.startsAt, a.endsAt),
  );
  if (conflict) return "conflict";

  return null;
}

/** Todos os horários livres do dia para os profissionais informados. */
export function computeSlots(
  ctx: AvailabilityContext,
  date: string,
  service: Service,
  professionals: Professional[],
  opts: SlotOptions = {},
): Slot[] {
  const slots: Slot[] = [];
  const step = Math.max(5, ctx.settings.slotIntervalMinutes);

  for (const pro of professionals) {
    if (!pro.active) continue;
    for (const win of workWindows(ctx.hours, pro.id, date)) {
      for (
        let min = win.opensMin;
        min + service.durationMinutes <= win.closesMin;
        min += step
      ) {
        const startsAt = fromLocal(date, min);
        const reason = evaluateSlot(ctx, pro, service, startsAt, {
          ...opts,
          requireGrid: true,
        });
        if (reason === null) {
          slots.push({
            professionalId: pro.id,
            startsAt,
            endsAt: addMinutesISO(startsAt, service.durationMinutes),
            startMin: min,
          });
        }
      }
    }
  }
  return slots.sort(
    (a, b) => a.startMin - b.startMin || a.professionalId.localeCompare(b.professionalId),
  );
}

/** Horários distintos (para "qualquer profissional"). */
export function uniqueStarts(slots: Slot[]): Slot[] {
  const seen = new Set<string>();
  const out: Slot[] = [];
  for (const s of slots) {
    if (!seen.has(s.startsAt)) {
      seen.add(s.startsAt);
      out.push(s);
    }
  }
  return out;
}

/**
 * "Qualquer profissional": escolhe, entre os livres naquele horário, quem tem
 * menos atendimentos no dia (distribui a carga); empate → ordem de cadastro.
 */
export function pickProfessional(
  candidates: Professional[],
  appointments: Appointment[],
  startsAt: string,
): Professional | null {
  const date = toLocalParts(startsAt).date;
  const load = (id: string) =>
    appointments.filter(
      (a) =>
        a.professionalId === id &&
        SLOT_OCCUPYING_STATUSES.includes(a.status) &&
        toLocalParts(a.startsAt).date === date,
    ).length;
  return (
    [...candidates].sort(
      (a, b) => load(a.id) - load(b.id) || a.sortOrder - b.sortOrder,
    )[0] ?? null
  );
}

/** Dias (YYYY-MM-DD) do intervalo de reservas com pelo menos um horário livre. */
export function daysWithAvailability(
  ctx: AvailabilityContext,
  service: Service,
  professionals: Professional[],
  fromDate: string,
  days: number,
  offsetDays = 0,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (let i = 0; i < days; i++) {
    const d = addDays(fromDate, offsetDays + i);
    out[d] = computeSlots(ctx, d, service, professionals).length > 0;
  }
  return out;
}

export const REJECTION_MESSAGES: Record<SlotRejection, string> = {
  past: "Esse horário já passou.",
  too_soon: "Esse horário exige mais antecedência para agendar.",
  too_far: "Ainda não abrimos a agenda para essa data.",
  not_offered: "Esse profissional não realiza o serviço escolhido.",
  outside_hours: "Esse horário está fora do expediente.",
  blocked: "Esse horário está bloqueado na agenda.",
  conflict: "Esse horário acabou de ser ocupado. Escolha outro.",
  off_grid: "Horário inválido para a agenda.",
};
