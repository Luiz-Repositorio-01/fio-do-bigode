"use client";

import Link from "next/link";
import { SERVICE_GROUPS } from "@/config/seed";
import { formatDuration } from "@/domain/pricing";
import { track } from "@/lib/analytics";
import { useAppState } from "@/lib/store/store";
import type { Service } from "@/types";
import { PriceTag } from "./price-tag";

function ServiceRow({ service }: { service: Service }) {
  return (
    <li className="group grid gap-x-6 gap-y-3 border-b border-edge py-5 sm:grid-cols-[1fr_auto_auto] sm:items-center">
      <div>
        <h3 className="display text-[1.3rem] leading-snug">{service.name}</h3>
        {service.description && <p className="mt-1 max-w-xl text-[15px] text-soft">{service.description}</p>}
        <p className="label-caps mt-1.5 text-[11px] text-soft">
          {service.durationConfirmed ? "" : "~"}
          {formatDuration(service.durationMinutes)}
        </p>
      </div>
      <PriceTag service={service} />
      <Link
        href={`/agendar?servico=${service.id}`}
        onClick={() => track("select_service", { service: service.name, origin: "service_list" })}
        className="label-caps inline-flex h-10 items-center justify-center rounded-[3px] border border-accent/60 px-5 text-sm text-accent-hi transition-colors hover:bg-accent hover:text-accent-fg sm:w-28"
      >
        Agendar
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
    <div className="space-y-12">
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
