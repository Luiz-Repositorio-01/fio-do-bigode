"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconPlus } from "@/components/ui/icons";
import { SelectField, TextField } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/misc";
import { useNow } from "@/hooks/use-now";
import { formatPrice } from "@/domain/pricing";
import { formatDateBR, minutesToHHmm, toLocalParts } from "@/domain/time";
import { formatPhoneBR } from "@/domain/whatsapp";
import { STATUS_LABEL, StatusBadge } from "@/features/booking/status";
import { useAppState } from "@/lib/store/store";
import type { AppointmentStatus } from "@/types";
import { AppointmentDialog } from "./appointment-dialog";
import { NewBookingDialog } from "./new-booking-dialog";
import { Card, PageTitle, TableWrap, TD, TH } from "./ui";

type Period = "upcoming" | "today" | "past" | "all";

export function AppointmentsList() {
  const state = useAppState();
  const [status, setStatus] = useState<AppointmentStatus | "all">("all");
  const [period, setPeriod] = useState<Period>("upcoming");
  const [proId, setProId] = useState("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [limit, setLimit] = useState(50);

  const now = useNow(60_000);
  const rows = useMemo(() => {
    const today = toLocalParts(now).date;
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return state.appointments
      .map((a) => ({ a, c: state.customers.find((c) => c.id === a.customerId) }))
      .filter(({ a, c }) => {
        const d = toLocalParts(a.startsAt).date;
        if (status !== "all" && a.status !== status) return false;
        if (proId !== "all" && a.professionalId !== proId) return false;
        if (period === "upcoming" && new Date(a.startsAt).getTime() < now) return false;
        if (period === "today" && d !== today) return false;
        if (period === "past" && new Date(a.startsAt).getTime() >= now) return false;
        if (q) {
          const hit =
            c?.name.toLowerCase().includes(q) ||
            (qDigits.length >= 3 && c?.whatsapp.includes(qDigits)) ||
            a.serviceName.toLowerCase().includes(q);
          if (!hit) return false;
        }
        return true;
      })
      .sort((x, y) =>
        period === "past" || period === "all"
          ? y.a.startsAt.localeCompare(x.a.startsAt)
          : x.a.startsAt.localeCompare(y.a.startsAt),
      );
  }, [state.appointments, state.customers, status, period, proId, query, now]);

  return (
    <>
      <PageTitle
        title="Agendamentos"
        description="Todos os horários — do site e criados pela equipe."
        actions={
          <Button onClick={() => setCreating(true)}>
            <IconPlus width={16} height={16} /> Novo agendamento
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextField label="Buscar" placeholder="Nome, WhatsApp ou serviço" value={query} onChange={(e) => setQuery(e.target.value)} />
        <SelectField label="Período" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
          <option value="upcoming">Próximos</option>
          <option value="today">Hoje</option>
          <option value="past">Passados</option>
          <option value="all">Todos</option>
        </SelectField>
        <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus | "all")}>
          <option value="all">Todos</option>
          {(Object.keys(STATUS_LABEL) as AppointmentStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </SelectField>
        <SelectField label="Profissional" value={proId} onChange={(e) => setProId(e.target.value)}>
          <option value="all">Todos</option>
          {state.professionals.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </SelectField>
      </div>

      <Card flush>
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nenhum agendamento encontrado" description="Ajuste os filtros ou crie um novo agendamento." />
          </div>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <TH>Data</TH>
                <TH>Cliente</TH>
                <TH>Serviço</TH>
                <TH>Profissional</TH>
                <TH>Valor</TH>
                <TH>Status</TH>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map(({ a, c }) => {
                const l = toLocalParts(a.startsAt);
                return (
                  <tr key={a.id} className="hover:bg-panel-2/50">
                    <TD className="whitespace-nowrap tabular-nums">
                      <button type="button" onClick={() => setOpenId(a.id)} className="text-left text-accent-hi underline underline-offset-4">
                        {formatDateBR(l.date)} {minutesToHHmm(l.minutes)}
                      </button>
                    </TD>
                    <TD>
                      <span className="block font-medium">{c?.name ?? "—"}</span>
                      <span className="block text-xs text-soft">{c ? formatPhoneBR(c.whatsapp) : ""}</span>
                    </TD>
                    <TD>{a.serviceName}</TD>
                    <TD>{state.professionals.find((p) => p.id === a.professionalId)?.name ?? "—"}</TD>
                    <TD className="whitespace-nowrap tabular-nums">
                      {a.status === "completed" ? formatPrice(a.finalPriceCents, false) : formatPrice(a.priceCents, a.priceIsStartingAt)}
                    </TD>
                    <TD><StatusBadge status={a.status} /></TD>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
        {rows.length > limit && (
          <div className="border-t border-edge p-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => setLimit(limit + 50)}>
              Mostrar mais ({rows.length - limit})
            </Button>
          </div>
        )}
      </Card>
      <p className="mt-2 text-xs text-soft">{rows.length} agendamento(s)</p>

      <AppointmentDialog appointmentId={openId} onClose={() => setOpenId(null)} />
      <NewBookingDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
