"use client";

import { useState } from "react";
import { IconChevron } from "@/components/ui/icons";
import { addDays, formatMonthYear, formatDateLong, todayLocal, weekdayOf } from "@/domain/time";

const WEEKDAY_HEAD = ["D", "S", "T", "Q", "Q", "S", "S"];

const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
function addMonths(monthDate: string, n: number): string {
  const [y, m] = monthDate.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}
function daysInMonth(monthDate: string): number {
  const [y, m] = monthDate.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function DatePicker({
  value,
  onChange,
  availability,
  windowDays,
  now,
}: {
  value: string | null;
  onChange: (date: string) => void;
  /** dia → tem horário livre? Dias fora do mapa ficam indisponíveis. */
  availability: Record<string, boolean>;
  windowDays: number;
  now: number;
}) {
  const today = todayLocal(now);
  const lastDay = addDays(today, windowDays);
  const [month, setMonth] = useState(monthStart(value ?? today));

  const canPrev = month > monthStart(today);
  const canNext = addMonths(month, 1) <= monthStart(lastDay);
  const offset = weekdayOf(month);
  const total = daysInMonth(month);

  const cells: Array<string | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: total }, (_, i) => `${month.slice(0, 8)}${String(i + 1).padStart(2, "0")}`),
  ];

  return (
    <div className="rounded-md border border-edge bg-panel p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, -1))}
          disabled={!canPrev}
          aria-label="Mês anterior"
          className="rounded p-2 text-soft hover:bg-panel-2 hover:text-fg disabled:opacity-30"
        >
          <IconChevron className="rotate-180" />
        </button>
        <p className="display text-lg" aria-live="polite">
          {formatMonthYear(month)}
        </p>
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, 1))}
          disabled={!canNext}
          aria-label="Próximo mês"
          className="rounded p-2 text-soft hover:bg-panel-2 hover:text-fg disabled:opacity-30"
        >
          <IconChevron />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center" role="group" aria-label="Escolha a data">
        {WEEKDAY_HEAD.map((d, i) => (
          <span key={i} className="label-caps py-1 text-[11px] text-soft" aria-hidden>
            {d}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const inWindow = d >= today && d <= lastDay;
          const free = inWindow && availability[d] === true;
          const selected = value === d;
          const label = `${formatDateLong(d)}${free ? "" : ", sem horários"}`;
          return (
            <button
              key={d}
              type="button"
              disabled={!free}
              aria-pressed={selected}
              aria-label={label}
              onClick={() => onChange(d)}
              className={[
                "relative flex aspect-square items-center justify-center rounded text-[15px] tabular-nums transition-colors",
                selected
                  ? "bg-accent font-semibold text-accent-fg"
                  : free
                    ? "border border-edge text-fg hover:border-accent hover:text-accent-hi"
                    : "text-soft/40 line-through decoration-soft/30",
              ].join(" ")}
            >
              {Number(d.slice(8))}
              {d === today && !selected && (
                <span aria-hidden className="absolute bottom-1 h-1 w-1 rounded-full bg-accent-hi" />
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-soft">
        Dias riscados estão fechados, sem horários livres ou fora da janela de agendamento (até {windowDays} dias).
      </p>
    </div>
  );
}
