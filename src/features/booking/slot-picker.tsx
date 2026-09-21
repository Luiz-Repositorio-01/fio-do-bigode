"use client";

import { minutesToHHmm } from "@/domain/time";
import type { Slot } from "@/types";

const PERIODS = [
  { key: "manha", label: "Manhã", test: (m: number) => m < 12 * 60 },
  { key: "tarde", label: "Tarde", test: (m: number) => m >= 12 * 60 && m < 18 * 60 },
  { key: "noite", label: "Noite", test: (m: number) => m >= 18 * 60 },
] as const;

export function SlotPicker({
  slots,
  value,
  onChange,
}: {
  slots: Slot[];
  value: string | null;
  onChange: (slot: Slot) => void;
}) {
  return (
    <div className="space-y-5">
      {PERIODS.map((p) => {
        const list = slots.filter((s) => p.test(s.startMin));
        if (list.length === 0) return null;
        return (
          <fieldset key={p.key}>
            <legend className="label-caps mb-2 text-xs text-soft">{p.label}</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {list.map((s) => {
                const selected = value === s.startsAt;
                return (
                  <button
                    key={s.startsAt}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onChange(s)}
                    className={`h-11 rounded-[3px] border text-[15px] tabular-nums transition-colors ${
                      selected
                        ? "border-accent bg-accent font-semibold text-accent-fg"
                        : "border-edge bg-panel hover:border-accent hover:text-accent-hi"
                    }`}
                  >
                    {minutesToHHmm(s.startMin)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
