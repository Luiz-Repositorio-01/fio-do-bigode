"use client";

import type { ReactNode } from "react";
import { formatBRL } from "@/domain/pricing";

export function PageTitle({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="display text-3xl md:text-4xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className = "",
  flush = false,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={`min-w-0 rounded-md border border-edge bg-panel ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-edge px-5 py-4">
          <div>
            {title && <h2 className="display text-xl">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-soft">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}
export const TH = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <th scope="col" className={`label-caps whitespace-nowrap border-b border-edge px-4 py-3 text-xs text-soft ${className}`}>
    {children}
  </th>
);
export const TD = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <td className={`border-b border-edge/60 px-4 py-3 align-middle ${className}`}>{children}</td>
);

/** Controle segmentado (troca de visão). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-[3px] border border-edge bg-panel p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`label-caps h-9 rounded-[2px] px-4 text-[13px] transition-colors ${
            value === o.value ? "bg-accent text-accent-fg" : "text-soft hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Barras horizontais (ranking). */
export function BarList({
  items,
  format = (n) => String(n),
}: {
  items: Array<{ label: string; value: number; hint?: string }>;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{i.label}</span>
            <span className="shrink-0 tabular-nums text-soft">
              {format(i.value)}
              {i.hint ? ` · ${i.hint}` : ""}
            </span>
          </div>
          <div className="h-2 rounded-full bg-panel-2">
            <div className="h-2 rounded-full bg-accent" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Colunas verticais (série temporal). */
export function ColumnChart({
  items,
  format = formatBRL,
  ariaLabel,
}: {
  items: Array<{ label: string; value: number }>;
  format?: (n: number) => string;
  ariaLabel: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div role="img" aria-label={ariaLabel} className="flex h-40 items-end gap-1.5">
      {items.map((i) => (
        <div key={i.label} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5">
          <div
            title={`${i.label}: ${format(i.value)}`}
            className={`w-full rounded-t-[2px] ${i.value > 0 ? "bg-accent" : "bg-panel-2"}`}
            style={{ height: `${Math.max(i.value > 0 ? 6 : 2, (i.value / max) * 100)}%` }}
          />
          <span className="truncate text-center text-[10px] text-soft">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-md border border-edge bg-panel p-4">
      <p className="label-caps text-xs text-soft">{label}</p>
      <p className="display mt-1.5 text-3xl tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-soft">{hint}</p>}
    </div>
  );
}
