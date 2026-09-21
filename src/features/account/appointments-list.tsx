"use client";

import { useState } from "react";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { AppointmentCard } from "./appointment-card";
import { useCustomer } from "./use-customer";

const TABS = [
  { key: "next", label: "Próximos" },
  { key: "done", label: "Realizados" },
  { key: "cancelled", label: "Cancelados" },
] as const;

export function AppointmentsList() {
  const ctx = useCustomer();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("next");
  if (!ctx.customer) return null;
  const { appointments, customer, now } = ctx;

  const lists = {
    next: appointments
      .filter((a) => (a.status === "pending" || a.status === "confirmed") && new Date(a.endsAt).getTime() >= now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    done: appointments.filter((a) => a.status === "completed"),
    cancelled: appointments.filter((a) => a.status === "cancelled" || a.status === "no_show"),
  };
  const list = lists[tab];

  return (
    <div>
      <div role="tablist" aria-label="Filtrar agendamentos" className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`label-caps rounded-full border px-4 py-2 text-xs transition-colors ${
              tab === t.key ? "border-accent bg-accent text-accent-fg" : "border-edge text-soft hover:text-fg"
            }`}
          >
            {t.label} <span className="opacity-70">({lists[t.key].length})</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState
          title={tab === "next" ? "Nenhum horário marcado" : tab === "done" ? "Nenhum atendimento realizado ainda" : "Nada por aqui"}
          action={tab === "next" ? <LinkButton href="/agendar">Agendar horário</LinkButton> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {list.map((a) => (
            <AppointmentCard key={a.id} appointment={a} customerId={customer.id} />
          ))}
        </div>
      )}
    </div>
  );
}
