import type { BusinessHour, Weekday } from "@/types";
import { minutesToHHmm, toLocalParts, weekdayLong, weekdayShort } from "./time";

export interface DaySchedule {
  weekday: Weekday;
  windows: Array<{ opensMin: number; closesMin: number }>;
}

/** Horário da barbearia (professionalId = null) por dia da semana, começando na segunda. */
export function businessSchedule(hours: BusinessHour[]): DaySchedule[] {
  const order: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
  return order.map((weekday) => ({
    weekday,
    windows: hours
      .filter((h) => h.professionalId === null && h.weekday === weekday)
      .map((h) => ({ opensMin: h.opensMin, closesMin: h.closesMin }))
      .sort((a, b) => a.opensMin - b.opensMin),
  }));
}

const windowsKey = (d: DaySchedule) =>
  d.windows.map((w) => `${w.opensMin}-${w.closesMin}`).join("|");

export const formatWindows = (d: DaySchedule) =>
  d.windows.length === 0
    ? "Fechado"
    : d.windows.map((w) => `${minutesToHHmm(w.opensMin)} às ${minutesToHHmm(w.closesMin)}`).join(" e ");

/** Agrupa dias consecutivos iguais: "Segunda a quinta — 09:00 às 20:00". */
export function groupedSchedule(schedule: DaySchedule[]): Array<{ label: string; value: string }> {
  const groups: DaySchedule[][] = [];
  for (const day of schedule) {
    const last = groups.at(-1);
    if (last && windowsKey(last[0]) === windowsKey(day)) last.push(day);
    else groups.push([day]);
  }
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  return groups.map((g) => ({
    label:
      g.length === 1
        ? cap(weekdayLong(g[0].weekday))
        : g.length === 2
          ? `${cap(weekdayLong(g[0].weekday))} e ${weekdayLong(g[1].weekday)}`
          : `${cap(weekdayLong(g[0].weekday))} a ${weekdayLong(g.at(-1)!.weekday)}`,
    value: formatWindows(g[0]),
  }));
}

export interface OpenStatus {
  isOpen: boolean;
  label: string;
}

export function openStatus(hours: BusinessHour[], now: number): OpenStatus {
  const schedule = businessSchedule(hours);
  const local = toLocalParts(now);
  const today = schedule.find((d) => d.weekday === local.weekday);
  const current = today?.windows.find((w) => local.minutes >= w.opensMin && local.minutes < w.closesMin);
  if (current) return { isOpen: true, label: `Aberto agora · fecha às ${minutesToHHmm(current.closesMin)}` };

  const laterToday = today?.windows.find((w) => w.opensMin > local.minutes);
  if (laterToday) return { isOpen: false, label: `Fechado · abre hoje às ${minutesToHHmm(laterToday.opensMin)}` };

  for (let i = 1; i <= 7; i++) {
    const wd = ((local.weekday + i) % 7) as Weekday;
    const next = schedule.find((d) => d.weekday === wd)?.windows[0];
    if (next) {
      const when = i === 1 ? "amanhã" : weekdayLong(wd);
      return { isOpen: false, label: `Fechado · abre ${when} às ${minutesToHHmm(next.opensMin)}` };
    }
  }
  return { isOpen: false, label: "Fechado" };
}

export const shortWeek = (w: Weekday) => weekdayShort(w);
