"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconPlus } from "@/components/ui/icons";
import { SelectField, TextField, Toggle } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Badge, Notice } from "@/components/ui/misc";
import { formatDateTimeBR, fromLocal, hhmmToMinutes, todayLocal } from "@/domain/time";
import { api } from "@/lib/api";
import { useAppState } from "@/lib/store/store";
import { blockFormSchema } from "@/schemas";
import { addBlock, removeBlock } from "@/services/admin";
import type { BlockedPeriod } from "@/types";
import { useRun } from "./use-run";

const KIND_LABEL: Record<BlockedPeriod["kind"], string> = {
  block: "Bloqueio",
  vacation: "Férias",
  holiday: "Feriado / folga",
  maintenance: "Manutenção",
};

/** Bloqueios de agenda. `scope`: "shop" = toda a barbearia; ou o id de um profissional. */
export function BlocksManager({ scope }: { scope: "shop" | string }) {
  const { blocks } = useAppState();
  const { busy, run } = useRun();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<BlockedPeriod["kind"]>("block");
  const [startDate, setStartDate] = useState(todayLocal());
  const [endDate, setEndDate] = useState(todayLocal());
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("14:00");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const professionalId = scope === "shop" ? null : scope;
  const list = blocks
    .filter((b) => b.professionalId === professionalId)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  function openDialog() {
    setKind("block");
    setStartDate(todayLocal());
    setEndDate(todayLocal());
    setAllDay(true);
    setReason("");
    setError(null);
    setOpen(true);
  }

  async function save() {
    const startsAt = fromLocal(startDate, allDay ? 0 : hhmmToMinutes(startTime));
    const endsAt = allDay ? fromLocal(endDate, 1440) : fromLocal(endDate, hhmmToMinutes(endTime));
    const parsed = blockFormSchema.safeParse({ professionalId, startsAt, endsAt, kind, reason });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Confira os dados.");
    const r = await run(() => api.admin((s) => addBlock(s, parsed.data)), "Bloqueio criado.");
    if (r.ok) setOpen(false);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-soft">
          {scope === "shop" ? "Fecha a agenda de toda a barbearia (feriados, recesso)." : "Folgas, férias ou ausências deste profissional."}
        </p>
        <Button size="sm" variant="secondary" onClick={openDialog}><IconPlus width={14} height={14} /> Bloquear</Button>
      </div>
      {list.length === 0 ? (
        <p className="rounded-md border border-dashed border-edge p-4 text-center text-sm text-soft">Nenhum bloqueio cadastrado.</p>
      ) : (
        <ul className="divide-y divide-edge rounded-md border border-edge">
          {list.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="min-w-0">
                <Badge tone="neutral">{KIND_LABEL[b.kind]}</Badge>{" "}
                <span className="tabular-nums">{formatDateTimeBR(b.startsAt)} → {formatDateTimeBR(b.endsAt)}</span>
                {b.reason && <span className="block text-soft">{b.reason}</span>}
              </span>
              <Button size="sm" variant="ghost" loading={busy} onClick={() => run(() => api.admin((s) => removeBlock(s, b.id)), "Bloqueio removido.")}>
                Remover
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo bloqueio"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={save} loading={busy}>Salvar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as BlockedPeriod["kind"])}>
            {(Object.keys(KIND_LABEL) as BlockedPeriod["kind"][]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </SelectField>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="De" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }} />
            <TextField label="Até" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <Toggle label="Dia(s) inteiro(s)" checked={allDay} onChange={setAllDay} />
          {!allDay && (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Início" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              <TextField label="Fim" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          )}
          <TextField label="Motivo" optional maxLength={120} value={reason} onChange={(e) => setReason(e.target.value)} />
          {error && <Notice tone="bad">{error}</Notice>}
          <p className="text-xs text-soft">Horários já agendados dentro do bloqueio não são cancelados automaticamente — remarque-os pela agenda.</p>
        </div>
      </Modal>
    </div>
  );
}
