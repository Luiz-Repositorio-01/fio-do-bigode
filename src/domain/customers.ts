/** Métricas de CRM e segmentação de clientes (funções puras). */
import type {
  Appointment,
  BusinessSettings,
  Customer,
  CustomerSegmentKey,
  LoyaltyLevel,
  LoyaltyTransaction,
} from "@/types";
import { lifetimePointsOf, levelFor } from "./loyalty";
import { diffDays, todayLocal, toLocalParts } from "./time";

export interface CustomerMetrics {
  visits: number;
  lastVisitAt: string | null;
  totalSpentCents: number;
  avgTicketCents: number;
  preferredProfessionalId: string | null;
  topServiceName: string | null;
  nextAppointment: Appointment | null;
  noShows: number;
  cancellations: number;
}

function mode<T>(values: T[]): T | null {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function customerMetrics(
  customerId: string,
  appointments: Appointment[],
  now: number,
): CustomerMetrics {
  const mine = appointments.filter((a) => a.customerId === customerId);
  const done = mine.filter((a) => a.status === "completed");
  const spent = done.reduce((s, a) => s + (a.finalPriceCents ?? a.priceCents ?? 0), 0);
  const upcoming = mine
    .filter(
      (a) =>
        (a.status === "pending" || a.status === "confirmed") &&
        new Date(a.startsAt).getTime() >= now,
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const last = [...done].sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0];

  return {
    visits: done.length,
    lastVisitAt: last?.startsAt ?? null,
    totalSpentCents: spent,
    avgTicketCents: done.length ? Math.round(spent / done.length) : 0,
    preferredProfessionalId: mode(done.map((a) => a.professionalId)),
    topServiceName: mode(done.map((a) => a.serviceName)),
    nextAppointment: upcoming[0] ?? null,
    noShows: mine.filter((a) => a.status === "no_show").length,
    cancellations: mine.filter((a) => a.status === "cancelled").length,
  };
}

/** Dias até o próximo aniversário (0 = hoje). null se sem data. */
export function daysUntilBirthday(birthDate: string | null, today: string): number | null {
  if (!birthDate) return null;
  const [, m, d] = birthDate.split("-").map(Number);
  const [ty] = today.split("-").map(Number);
  const build = (y: number) => {
    // 29/02 em ano não bissexto → 28/02
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const day = m === 2 && d === 29 && !leap ? 28 : d;
    return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
  let target = build(ty);
  if (diffDays(today, target) < 0) target = build(ty + 1);
  return diffDays(today, target);
}

export interface CustomerSegments {
  isNew: boolean;
  isActive: boolean;
  isRecurring: boolean;
  isInactive: boolean;
  /** Menor limiar (30/60/90) atingido; null se não inativo. */
  inactiveBucket: number | null;
  isVip: boolean;
  birthdayInDays: number | null;
  daysSinceLastActivity: number;
}

export function segmentsFor(args: {
  customer: Customer;
  metrics: CustomerMetrics;
  ledger: LoyaltyTransaction[];
  levels: LoyaltyLevel[];
  settings: BusinessSettings;
  now: number;
}): CustomerSegments {
  const { customer, metrics, settings, now } = args;
  const today = todayLocal(now);
  const reference = metrics.lastVisitAt ?? customer.createdAt;
  const daysSince = Math.max(0, diffDays(toLocalParts(reference).date, today));
  const [d1, d2, d3] = settings.retention.inactiveDays;
  const hasUpcoming = metrics.nextAppointment !== null;

  const isInactive = !hasUpcoming && daysSince >= d1;
  const bucket = !isInactive ? null : daysSince >= d3 ? d3 : daysSince >= d2 ? d2 : d1;

  const level = levelFor(lifetimePointsOf(args.ledger, customer.id), args.levels);
  const birthdayInDays = daysUntilBirthday(customer.birthDate, today);

  return {
    isNew: diffDays(toLocalParts(customer.createdAt).date, today) <= settings.retention.newCustomerDays,
    isActive: !isInactive,
    isRecurring: metrics.visits >= settings.retention.recurringMinVisits,
    isInactive,
    inactiveBucket: bucket,
    isVip: Boolean(level?.isVip),
    birthdayInDays,
    daysSinceLastActivity: daysSince,
  };
}

export function inSegment(
  key: CustomerSegmentKey,
  s: CustomerSegments,
  birthdayLookaheadDays: number,
): boolean {
  switch (key) {
    case "all":
      return true;
    case "active":
      return s.isActive;
    case "recurring":
      return s.isRecurring;
    case "new":
      return s.isNew;
    case "inactive":
      return s.isInactive;
    case "vip":
      return s.isVip;
    case "birthday":
      return s.birthdayInDays !== null && s.birthdayInDays <= birthdayLookaheadDays;
  }
}

export const SEGMENT_LABELS: Record<CustomerSegmentKey, string> = {
  all: "Todos os clientes",
  active: "Clientes ativos",
  recurring: "Clientes recorrentes",
  new: "Clientes novos",
  inactive: "Clientes inativos",
  vip: "Clientes VIP",
  birthday: "Aniversariantes",
};
