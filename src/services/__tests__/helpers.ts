import { createSeedState } from "@/config/seed";
import type { DataState } from "@/types";
import { fromLocal } from "@/domain/time";

/** Segunda-feira, 21/09/2026 10:00 (horário da barbearia). */
export const NOW = new Date(fromLocal("2026-09-21", 10 * 60)).getTime();
export const TUESDAY = "2026-09-22";
export const SUNDAY = "2026-09-27";

export const freshState = (): DataState => createSeedState();

export const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return fromLocal(date, h * 60 + m);
};

export const person = (n: number) => ({
  name: `Cliente Teste ${n}`,
  whatsapp: `1999000000${n}`.slice(0, 11),
});
