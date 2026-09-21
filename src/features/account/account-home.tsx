"use client";

import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, StatCard } from "@/components/ui/misc";
import { formatDateBR, toLocalParts } from "@/domain/time";
import { AppointmentCard } from "./appointment-card";
import { ReferralCard } from "./referral-card";
import { useCustomer } from "./use-customer";

export function AccountHome() {
  const ctx = useCustomer();
  if (!ctx.customer) return null;
  const { customer, metrics, loyalty, wallet, state } = ctx;
  const availableBenefits = wallet.filter((r) => r.status === "available").length;
  const enabled = state.settings.loyalty.enabled;

  return (
    <div className="space-y-8">
      <section aria-labelledby="proximo">
        <h2 id="proximo" className="label-caps mb-3 text-sm text-accent-hi">Próximo agendamento</h2>
        {metrics.nextAppointment ? (
          <AppointmentCard appointment={metrics.nextAppointment} customerId={customer.id} />
        ) : (
          <EmptyState
            title="Nenhum horário marcado"
            description="Que tal garantir o próximo?"
            action={<LinkButton href="/agendar">Agendar horário</LinkButton>}
          />
        )}
      </section>

      <section aria-label="Resumo" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {enabled && <StatCard label="Pontos" value={loyalty.balance.toLocaleString("pt-BR")} />}
        {enabled && <StatCard label="Nível" value={loyalty.level?.name ?? "—"} />}
        <StatCard label="Visitas" value={metrics.visits} />
        <StatCard
          label="Último atendimento"
          value={<span className="text-2xl">{metrics.lastVisitAt ? formatDateBR(toLocalParts(metrics.lastVisitAt).date) : "—"}</span>}
        />
        {enabled && (
          <StatCard
            label="Benefícios disponíveis"
            value={availableBenefits}
            hint={<Link href="/minha-conta/beneficios" className="underline underline-offset-4">Ver benefícios</Link>}
          />
        )}
      </section>

      {enabled && loyalty.next && (
        <section className="rounded-md border border-edge bg-panel p-5" aria-label="Progresso de nível">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-soft">
              Faltam <strong className="text-fg tabular-nums">{loyalty.next.missing.toLocaleString("pt-BR")}</strong> pontos para o
              nível <strong className="text-accent-hi">{loyalty.next.level.name}</strong>
            </p>
            <Link href="/minha-conta/fidelidade" className="label-caps shrink-0 text-xs text-accent-hi underline underline-offset-4">
              Detalhes
            </Link>
          </div>
          <Progress value={loyalty.lifetime} max={loyalty.next.level.minPoints} />
        </section>
      )}

      <ReferralCard customer={customer} />
    </div>
  );
}

export function Progress({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Progresso"}
      className="mt-3 h-2 overflow-hidden rounded-full bg-panel-2"
    >
      <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}
