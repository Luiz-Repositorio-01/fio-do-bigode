/**
 * Utilitários de tempo independentes do fuso do navegador.
 *
 * A barbearia opera em America/Sao_Paulo. O Brasil não adota horário de verão
 * desde 2019, então usamos o offset fixo UTC-03:00. Todo horário persistido é
 * ISO 8601 com offset; toda regra de agenda trabalha em "minutos desde 00:00"
 * no relógio da barbearia.
 */
import type { Weekday } from "@/types";

export const BUSINESS_UTC_OFFSET_MIN = -180;
export const BUSINESS_TIMEZONE = "America/Sao_Paulo";
const MIN_MS = 60_000;
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");

export interface LocalParts {
  date: string; // YYYY-MM-DD
  minutes: number; // desde 00:00 local
  weekday: Weekday;
}

/** Converte um instante para data/hora no relógio da barbearia. */
export function toLocalParts(iso: string | number | Date): LocalParts {
  const ms = new Date(iso).getTime() + BUSINESS_UTC_OFFSET_MIN * MIN_MS;
  const d = new Date(ms);
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    weekday: d.getUTCDay() as Weekday,
  };
}

/** Monta um instante ISO (com offset -03:00) a partir de data local + minutos. */
export function fromLocal(date: string, minutes: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const utcMs =
    Date.UTC(y, m - 1, d) + minutes * MIN_MS - BUSINESS_UTC_OFFSET_MIN * MIN_MS;
  return new Date(utcMs).toISOString();
}

export function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as Weekday;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

export function todayLocal(now: Date | number = Date.now()): string {
  return toLocalParts(now).date;
}

export function minutesToHHmm(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

export function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function isValidDateString(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

export function addMinutesISO(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * MIN_MS).toISOString();
}

export function overlaps(
  aStart: string | number,
  aEnd: string | number,
  bStart: string | number,
  bEnd: string | number,
): boolean {
  return (
    new Date(aStart).getTime() < new Date(bEnd).getTime() &&
    new Date(bStart).getTime() < new Date(aEnd).getTime()
  );
}

const WEEKDAY_LONG = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;
const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
const MONTH_LONG = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

export const weekdayLong = (w: Weekday) => WEEKDAY_LONG[w];
export const weekdayShort = (w: Weekday) => WEEKDAY_SHORT[w];

/** "segunda-feira, 22 de setembro" */
export function formatDateLong(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${WEEKDAY_LONG[weekdayOf(date)]}, ${d} de ${MONTH_LONG[m - 1]}`;
}

/** "22/09" */
export function formatDateShort(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${pad(d)}/${pad(m)}`;
}

export function formatDateBR(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${pad(d)}/${pad(m)}/${y}`;
}

export function formatDateTimeBR(iso: string): string {
  const p = toLocalParts(iso);
  return `${formatDateBR(p.date)} às ${minutesToHHmm(p.minutes)}`;
}

export function formatMonthYear(date: string): string {
  const [y, m] = date.split("-").map(Number);
  const name = MONTH_LONG[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} de ${y}`;
}
