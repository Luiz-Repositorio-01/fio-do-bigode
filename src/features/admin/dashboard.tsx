"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { formatBRL } from "@/domain/pricing";
import { dashboardStats } from "@/domain/reports";
import { formatDateShort, minutesToHHmm, toLocalParts, weekdayShort, addDays } from "@/domain/time";
import { useNow } from "@/hooks/use-now";
import { StatusBadge } from "@/features/booking/status";
import { api } from "@/lib/api";
import { useAppState } from "@/lib/store/store";
import { AppointmentDialog } from "./appointment-dialog";
import { BarList, Card, ColumnChart, PageTitle, Stat } from "./ui";
import { useRun } from "./use-run";

export function Dashboard() {
  const state = useAppState();
  const now = useNow(60_000);
  const toast = useToast();
  const { busy, run } = useRun();
  const [openId, setOpenId] = useState<string | null>(null);
  const s = useMemo(() => dashboardStats(state, now), [state, now]);
  const customerName = (id: string) => state.customers.find((c) => c.id === id)?.name ?? "—";
  const proName = (id: string) => state.professionals.find((p) => p.id === id)?.name ?? "—";
  const hasDemo = state.customers.some((c) => c.isDemo);
  const empty = state.appointments.length === 0 && state.customers.length === 0;

  async function maintenance() {
    const r = await run(() => api.runMaintenance());
    if (r.ok) {
      const { expiredPoints, expiredRewards, birthdayBonuses } = r.value;
      toast(
        `Rotina concluída: ${expiredPoints} pontos expirados, ${expiredRewards} benefícios vencidos, ${birthdayBonuses} bônus de aniversário.`,
      );
    }
  }

  return (
    <>
      <PageTitle
        title="Dashboard"
        description="Visão do dia e do mês, calculada a partir dos atendimentos concluídos e dos agendamentos."
        actions={
          <>
            <Button variant="secondary" size="sm" loading={busy} onClick={maintenance}>
              Rodar rotina de fidelidade
            </Button>
            {hasDemo ? (
              <Button variant="danger" size="sm" loading={busy} onClick={() => run(() => api.clearDemoData(), "Dados de demonstração removidos.")}>
                Limpar dados de demonstração
              </Button>
            ) : (
              <Button size="sm" loading={busy} onClick={() => run(() => api.loadDemoData(), "Dados de demonstração carregados.")}>
                Carregar dados de demonstração
              </Button>
            )}
          </>
        }
      />

      {empty && (
        <div className="mb-6">
          <Notice tone="info" title="Ainda não há agendamentos nem clientes">
            Os números abaixo começam zerados. Para apresentar o sistema, carregue os dados fictícios de demonstração
            (clientes “Demo” com telefones inexistentes) — você remove tudo com um clique.
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Hoje" value={s.todayAppointments.filter((a) => a.status !== "no_show").length} hint="atendimentos no dia" />
        <Stat label="Pendentes" value={s.pendingUpcoming.length} hint="aguardando confirmação" />
        <Stat label="Faturamento do mês" value={formatBRL(s.monthRevenueCents)} hint={`${s.monthCompleted} atendimentos concluídos`} />
        <Stat label="Ticket médio" value={s.monthCompleted ? formatBRL(s.avgTicketCents) : "—"} hint="do mês" />
        <Stat label="Clientes" value={s.totalCustomers} hint={`${s.newCustomers30d} novos em 30 dias`} />
        <Stat label="Inativos" value={s.inactiveCount} hint={`sem visita há ${state.settings.retention.inactiveDays[0]}+ dias`} />
        <Stat
          label="Faltas (30 dias)"
          value={s.noShowRate30d === null ? "—" : `${Math.round(s.noShowRate30d * 100)}%`}
          hint="sobre atendimentos encerrados"
        />
        <Stat label="Pontos (30 dias)" value={`+${s.pointsIssued30d}`} hint={`${s.pointsRedeemed30d} resgatados`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Agenda de hoje" actions={<Link href="/admin/agenda" className="text-sm text-accent-hi underline underline-offset-4">Abrir agenda</Link>}>
          {s.todayAppointments.length === 0 ? (
            <EmptyState title="Nenhum horário hoje" description="Quando houver agendamentos para hoje, eles aparecem aqui." />
          ) : (
            <ul className="divide-y divide-edge">
              {s.todayAppointments.map((a) => {
                const l = toLocalParts(a.startsAt);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(a.id)}
                      className="flex w-full items-center gap-4 py-3 text-left hover:bg-panel-2/60"
                    >
                      <span className="display w-14 shrink-0 text-xl tabular-nums">{minutesToHHmm(l.minutes)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{customerName(a.customerId)}</span>
                        <span className="block truncate text-sm text-soft">{a.serviceName} · {proName(a.professionalId)}</span>
                      </span>
                      <StatusBadge status={a.status} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Pendentes de confirmação" description="Próximos agendamentos ainda não confirmados.">
          {s.pendingUpcoming.length === 0 ? (
            <p className="text-sm text-soft">Nada pendente.</p>
          ) : (
            <ul className="divide-y divide-edge">
              {s.pendingUpcoming.slice(0, 6).map((a) => {
                const l = toLocalParts(a.startsAt);
                return (
                  <li key={a.id}>
                    <button type="button" onClick={() => setOpenId(a.id)} className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-panel-2/60">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{customerName(a.customerId)}</span>
                        <span className="block truncate text-sm text-soft">{a.serviceName}</span>
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-soft">
                        {formatDateShort(l.date)} {minutesToHHmm(l.minutes)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Faturamento — últimos 14 dias" description="Soma do valor cobrado nos atendimentos concluídos.">
          <ColumnChart
            ariaLabel="Faturamento diário dos últimos 14 dias"
            items={s.revenueByDay.map((d) => ({ label: d.date.slice(8), value: d.cents }))}
            format={(n) => formatBRL(n)}
          />
        </Card>
        <Card title="Movimento por dia da semana" description="Agendamentos ativos: 30 dias atrás até 30 dias à frente.">
          <ColumnChart
            ariaLabel="Agendamentos por dia da semana"
            items={s.weekdayLoad.map((v, i) => ({ label: weekdayShort(i as 0), value: v }))}
            format={(n) => `${n} agend.`}
          />
        </Card>
        <Card title="Serviços mais realizados" description="Últimos 30 dias.">
          {s.topServices.length === 0 ? (
            <p className="text-sm text-soft">Sem atendimentos concluídos no período.</p>
          ) : (
            <BarList items={s.topServices.map((t) => ({ label: t.name, value: t.count, hint: formatBRL(t.cents) }))} format={(n) => `${n}x`} />
          )}
        </Card>
        <Card title="Por profissional" description="Atendimentos concluídos nos últimos 30 dias.">
          {s.byProfessional.length === 0 ? (
            <p className="text-sm text-soft">Sem atendimentos concluídos no período.</p>
          ) : (
            <BarList items={s.byProfessional.map((p) => ({ label: p.name, value: p.count, hint: formatBRL(p.cents) }))} format={(n) => `${n}x`} />
          )}
        </Card>
      </div>

      <Card
        className="mt-6"
        title="Aniversariantes"
        description={`Próximos ${state.settings.retention.birthdayLookaheadDays} dias (só clientes com data de nascimento informada).`}
      >
        {s.birthdays.length === 0 ? (
          <p className="text-sm text-soft">Nenhum aniversariante no período.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {s.birthdays.map(({ customer, inDays }) => (
              <li key={customer.id}>
                <Link href={`/admin/clientes/${customer.id}`} className="flex items-center justify-between rounded border border-edge px-3 py-2 hover:border-accent">
                  <span className="truncate">{customer.name}</span>
                  <span className="shrink-0 text-sm text-soft">{inDays === 0 ? "hoje" : `em ${inDays} d`} · {formatDateShort(addDays(s.today, inDays))}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AppointmentDialog appointmentId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
