import type { Service, Weekday } from "@/types";

/** Preço efetivo (centavos) do serviço em determinado dia da semana. */
export function priceFor(service: Service, weekday: Weekday): number | null {
  const rule = service.priceRules.find((r) => r.weekdays.includes(weekday));
  if (rule) return rule.priceCents;
  return service.priceCents;
}

/** Regra promocional ativa no dia, se houver (para exibir o rótulo). */
export function activeRuleLabel(service: Service, weekday: Weekday): string | null {
  return service.priceRules.find((r) => r.weekdays.includes(weekday))?.label ?? null;
}

export function formatBRL(cents: number | null | undefined): string {
  if (cents == null) return "Consultar";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function formatPrice(
  cents: number | null,
  startingAt: boolean,
): string {
  if (cents == null) return "Consultar";
  return startingAt ? `a partir de ${formatBRL(cents)}` : formatBRL(cents);
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/** "45", "45,5", "R$ 1.234,50" → centavos. Vazio/inválido → null. */
export function parseReaisToCents(input: string): number | null {
  const cleaned = input.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return null;
  // "1.234,50" → 1234.50 | "45.5" → 45.5
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** 4500 → "45,00" (para campos de formulário). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}
