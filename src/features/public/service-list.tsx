"use client";

import Link from "next/link";
import { SERVICE_GROUPS } from "@/config/seed";
import { formatDuration } from "@/domain/pricing";
import { IconChevron } from "@/components/ui/icons";
import { track } from "@/lib/analytics";
import { useAppState } from "@/lib/store/store";
import type { Service } from "@/types";
import { PriceTag } from "./price-tag";

function ServiceRow({ service }: { service: Service }) {
  return (
    <li className="border-b border-edge">
      <Link
        href={`/agendar?servico=${service.id}`}
        onClick={() => track("select_service", { service: service.name, origin: "service_list" })}
        className="group flex items-center gap-3 py-4 transition-colors active:bg-panel/70 sm:gap-6 sm:py-5"
      >
        <div className="min-w-0 flex-1">
          <h3 className="display text-[1.12rem] leading-snug sm:text-[1.3rem]">{service.name}</h3>
          {service.description && (
            <p className="mt-1 hidden max-w-xl text-[15px] text-soft sm:block">{service.description}</p>
          )}
          <p className="label-caps mt-1 text-[11px] text-soft">
            {service.durationConfirmed ? "" : "~"}
            {formatDuration(service.durationMinutes)}
          </p>
        </div>
        <PriceTag service={service} />
        <span
          aria-hidden
          className="label-caps hidden h-10 w-28 items-center justify-center rounded-[3px] border border-accent/60 text-sm text-accent-hi transition-colors group-hover:bg-accent group-hover:text-accent-fg sm:inline-flex"
        >
          Agendar
        </span>
        <IconChevron aria-hidden className="h-5 w-5 shrink-0 text-accent sm:hidden" />
      </Link>
    </li>
  );
}

/** Lista de serviços no formato "cardápio de barbearia", agrupada por tipo. */
export function ServiceList({ limitPerGroup }: { limitPerGroup?: number }) {
  const { services } = useAppState();
  const active = services.filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder);
  const grouped = new Set<string>();

  const groups: Array<{ key: string; label: string; items: Service[] }> = SERVICE_GROUPS.map((g) => {
    const items = g.ids
      .map((id) => active.find((s) => s.id === id))
      .filter((s): s is Service => Boolean(s));
    items.forEach((s) => grouped.add(s.id));
    return { key: g.key, label: g.label, items };
  });
  const others = active.filter((s) => !grouped.has(s.id));
  if (others.length) groups.push({ key: "outros", label: "Outros serviços", items: others });

  return (
    <div className="space-y-9 sm:space-y-12">
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <section key={g.key} aria-labelledby={`grp-${g.key}`}>
            <h2 id={`grp-${g.key}`} className="label-caps mb-1 flex items-center gap-4 text-sm text-accent-hi">
              {g.label}
              <span className="brass-rule flex-1" />
            </h2>
            <ul>
              {(limitPerGroup ? g.items.slice(0, limitPerGroup) : g.items).map((s) => (
                <ServiceRow key={s.id} service={s} />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
