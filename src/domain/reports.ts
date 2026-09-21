/** Indicadores do painel (funções puras sobre o estado). */
import type { Appointment, Customer, DataState } from "@/types";
import { customerMetrics, daysUntilBirthday } from "./customers";
import { addDays, todayLocal, toLocalParts } from "./time";

export const revenueOf = (a: Appointment): number => a.finalPriceCents ?? a.priceCents ?? 0;

export interface DashboardStats {
  today: string;
  todayAppointments: Appointment[];
  pendingUpcoming: Appointment[];
  monthRevenueCents: number;
  monthCompleted: number;
  avgTicketCents: number;
  newCustomers30d: number;
  totalCustomers: number;
  noShowRate30d: number | null;
  revenueByDay: Array<{ date: string; cents: number }>;
  topServices: Array<{ name: string; count: number; cents: number }>;
  byProfessional: Array<{ id: string; name: string; count: number; cents: number }>;
  weekdayLoad: number[];
  pointsIssued30d: number;
  pointsRedeemed30d: number;
  inactiveCount: number;
  birthdays: Array<{ customer: Customer; inDays: number }>;
}

export function dashboardStats(state: DataState, now: number): DashboardStats {
  const today = todayLocal(now);
  const month = today.slice(0, 7);
  const from30 = addDays(today, -30);
  const dateOf = (iso: string) => toLocalParts(iso).date;

  const active = (a: Appointment) => a.status !== "cancelled" && a.status !== "no_show";
  const todayAppointments = state.appointments
    .filter((a) => dateOf(a.startsAt) === today && a.status !== "cancelled")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const pendingUpcoming = state.appointments
    .filter((a) => a.status === "pending" && new Date(a.startsAt).getTime() >= now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const doneMonth = state.appointments.filter(
    (a) => a.status === "completed" && dateOf(a.startsAt).startsWith(month),
  );
  const monthRevenueCents = doneMonth.reduce((s, a) => s + revenueOf(a), 0);

  const revenueByDay = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(today, i - 13);
    const cents = state.appointments
      .filter((a) => a.status === "completed" && dateOf(a.startsAt) === date)
      .reduce((s, a) => s + revenueOf(a), 0);
    return { date, cents };
  });

  const done30 = state.appointments.filter(
    (a) => a.status === "completed" && dateOf(a.startsAt) >= from30 && dateOf(a.startsAt) <= today,
  );
  const svc = new Map<string, { count: number; cents: number }>();
  for (const a of done30) {
    const cur = svc.get(a.serviceName) ?? { count: 0, cents: 0 };
    svc.set(a.serviceName, { count: cur.count + 1, cents: cur.cents + revenueOf(a) });
  }
  const topServices = [...svc.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const byProfessional = state.professionals
    .map((p) => {
      const mine = done30.filter((a) => a.professionalId === p.id);
      return { id: p.id, name: p.name, count: mine.length, cents: mine.reduce((s, a) => s + revenueOf(a), 0) };
    })
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count);

  const weekdayLoad = [0, 0, 0, 0, 0, 0, 0];
  for (const a of state.appointments) {
    const d = dateOf(a.startsAt);
    if (active(a) && d >= from30 && d <= addDays(today, 30)) weekdayLoad[toLocalParts(a.startsAt).weekday] += 1;
  }

  const finished30 = state.appointments.filter(
    (a) => (a.status === "completed" || a.status === "no_show") && dateOf(a.startsAt) >= from30 && dateOf(a.startsAt) <= today,
  );
  const noShows = finished30.filter((a) => a.status === "no_show").length;

  const ledger30 = state.ledger.filter((t) => dateOf(t.createdAt) >= from30);
  const pointsIssued30d = ledger30.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const pointsRedeemed30d = ledger30.filter((t) => t.type === "REDEEM").reduce((s, t) => s - t.amount, 0);

  const [d1] = state.settings.retention.inactiveDays;
  let inactiveCount = 0;
  const birthdays: DashboardStats["birthdays"] = [];
  for (const c of state.customers) {
    const m = customerMetrics(c.id, state.appointments, now);
    const ref = m.lastVisitAt ?? c.createdAt;
    const since = Math.max(
      0,
      Math.round((Date.parse(today) - Date.parse(dateOf(ref))) / 86_400_000),
    );
    if (!m.nextAppointment && since >= d1) inactiveCount += 1;
    const inDays = daysUntilBirthday(c.birthDate, today);
    if (inDays !== null && inDays <= state.settings.retention.birthdayLookaheadDays) {
      birthdays.push({ customer: c, inDays });
    }
  }
  birthdays.sort((a, b) => a.inDays - b.inDays);

  return {
    today,
    todayAppointments,
    pendingUpcoming,
    monthRevenueCents,
    monthCompleted: doneMonth.length,
    avgTicketCents: doneMonth.length ? Math.round(monthRevenueCents / doneMonth.length) : 0,
    newCustomers30d: state.customers.filter((c) => dateOf(c.createdAt) >= from30).length,
    totalCustomers: state.customers.length,
    noShowRate30d: finished30.length ? noShows / finished30.length : null,
    revenueByDay,
    topServices,
    byProfessional,
    weekdayLoad,
    pointsIssued30d,
    pointsRedeemed30d,
    inactiveCount,
    birthdays,
  };
}
