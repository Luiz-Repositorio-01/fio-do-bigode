"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnchorButton, Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { appointmentMessage } from "@/domain/messages";
import { centsToInput, formatDuration, formatPrice, parseReaisToCents } from "@/domain/pricing";
import { formatDateLong, formatDateTimeBR, minutesToHHmm, toLocalParts } from "@/domain/time";
import { formatPhoneBR } from "@/domain/whatsapp";
import { CancelDialog, RescheduleDialog } from "@/features/booking/change-dialogs";
import { StatusBadge } from "@/features/booking/status";
import { api } from "@/lib/api";
import { useAppState } from "@/lib/store/store";
import { useRun } from "./use-run";

/** Detalhe do agendamento + ações da equipe (confirmar, concluir, falta, remarcar, cancelar, WhatsApp). */
export function AppointmentDialog({
  appointmentId,
  onClose,
}: {
  appointmentId: string | null;
  onClose: () => void;
}) {
  // key: cada agendamento aberto começa na tela de detalhes, sem sobras do anterior.
  return appointmentId ? <AppointmentDialogBody key={appointmentId} appointmentId={appointmentId} onClose={onClose} /> : null;
}

function AppointmentDialogBody({ appointmentId, onClose }: { appointmentId: string; onClose: () => void }) {
  const state = useAppState();
  const { busy, run } = useRun();
  const toast = useToast();
  const [mode, setMode] = useState<"view" | "complete" | "cancel" | "reschedule">("view");
  const initial = state.appointments.find((a) => a.id === appointmentId);
  const [price, setPrice] = useState(() => (initial ? centsToInput(initial.finalPriceCents ?? initial.priceCents) : ""));
  const [priceError, setPriceError] = useState<string | undefined>();

  const appointment = state.appointments.find((a) => a.id === appointmentId) ?? null;
  const customer = appointment ? state.customers.find((c) => c.id === appointment.customerId) : undefined;
  const pro = appointment ? state.professionals.find((p) => p.id === appointment.professionalId) : undefined;

  const history = useMemo(
    () =>
      appointment
        ? state.statusHistory
            .filter((h) => h.appointmentId === appointment.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [],
    [state.statusHistory, appointment],
  );

  if (!appointment) return null;
  const local = toLocalParts(appointment.startsAt);
  const active = appointment.status === "pending" || appointment.status === "confirmed";

  const links = (
    [
      ["reminder", "Lembrete"],
      ["confirmation", "Confirmação"],
      ["reschedule", "Remarcação"],
      ["cancellation", "Cancelamento"],
    ] as const
  )
    .map(([key, label]) => ({ label, msg: appointmentMessage(state, key, appointment) }))
    .filter((l) => l.msg);

  async function complete() {
    const cents = price.trim() ? parseReaisToCents(price) : (appointment!.priceCents ?? null);
    if (price.trim() && cents === null) return setPriceError("Valor inválido.");
    if (cents === null) return setPriceError("Informe o valor cobrado.");
    const r = await run(() => api.completeAppointment(appointment!.id, cents));
    if (r.ok) {
      const pts = r.value.pointsAwarded;
      toast(pts > 0 ? `Atendimento concluído. +${pts} pontos para ${customer?.name ?? "o cliente"}.` : "Atendimento concluído.");
      setMode("view");
    }
  }

  return (
    <>
      <Modal
        open={mode === "view" || mode === "complete"}
        onClose={() => {
          // O <dialog> também dispara "close" quando trocamos para Cancelar/Remarcar.
          if (mode === "view" || mode === "complete") onClose();
        }}
        title={appointment.serviceName}
        description={`${formatDateLong(local.date)} às ${minutesToHHmm(local.minutes)}`}
        size="md"
        footer={
          mode === "complete" ? (
            <>
              <Button variant="ghost" onClick={() => setMode("view")} disabled={busy}>Voltar</Button>
              <Button onClick={complete} loading={busy}>Concluir atendimento</Button>
            </>
          ) : active ? (
            <>
              {appointment.status === "pending" && (
                <Button
                  variant="secondary"
                  loading={busy}
                  onClick={() => run(() => api.confirmAppointment(appointment.id), "Agendamento confirmado.")}
                >
                  Confirmar
                </Button>
              )}
              <Button onClick={() => setMode("complete")}>Concluir</Button>
            </>
          ) : undefined
        }
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={appointment.status} />
            <span className="text-sm text-soft">
              {formatDuration(appointment.durationMinutes)} · {pro?.name ?? "—"} ·{" "}
              {appointment.source === "admin" ? "criado no painel" : "criado pelo site"}
            </span>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-soft">Cliente</dt>
            <dd>
              {customer ? (
                <Link href={`/admin/clientes/${customer.id}`} className="text-accent-hi underline underline-offset-4">
                  {customer.name}
                </Link>
              ) : "—"}
            </dd>
            <dt className="text-soft">WhatsApp</dt>
            <dd>{customer ? formatPhoneBR(customer.whatsapp) : "—"}</dd>
            <dt className="text-soft">Valor</dt>
            <dd className="tabular-nums">
              {appointment.status === "completed"
                ? formatPrice(appointment.finalPriceCents, false)
                : formatPrice(appointment.priceCents, appointment.priceIsStartingAt)}
              {appointment.status === "completed" && ` · +${appointment.pointsAwarded} pontos`}
            </dd>
            {appointment.customerNotes && (
              <>
                <dt className="text-soft">Pedido do cliente</dt>
                <dd>{appointment.customerNotes}</dd>
              </>
            )}
            {appointment.cancelReason && (
              <>
                <dt className="text-soft">Motivo</dt>
                <dd>{appointment.cancelReason}</dd>
              </>
            )}
          </dl>

          {mode === "complete" && (
            <div className="space-y-3 rounded-md border border-edge bg-panel-2 p-4">
              <TextField
                label="Valor cobrado (R$)"
                inputMode="decimal"
                value={price}
                error={priceError}
                hint={
                  appointment.priceIsStartingAt
                    ? "O preço do serviço é “a partir de”: confirme o valor real cobrado."
                    : "Este valor gera os pontos de fidelidade do cliente."
                }
                onChange={(e) => {
                  setPrice(e.target.value);
                  setPriceError(undefined);
                }}
              />
              <p className="text-xs text-soft">
                Ao concluir, a visita é registrada e os pontos são creditados uma única vez.
              </p>
            </div>
          )}

          {mode === "view" && (
            <>
              {active && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setMode("reschedule")}>Remarcar</Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy}
                    onClick={() => run(() => api.markNoShow(appointment.id), "Falta registrada.")}
                  >
                    Não compareceu
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setMode("cancel")}>Cancelar</Button>
                </div>
              )}

              {links.length > 0 && (
                <div>
                  <p className="label-caps mb-2 text-xs text-soft">Mensagem no WhatsApp</p>
                  <div className="flex flex-wrap gap-2">
                    {links.map((l) => (
                      <AnchorButton
                        key={l.label}
                        variant="whatsapp"
                        size="sm"
                        href={l.msg!.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {l.label}
                      </AnchorButton>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-soft">
                    Abre o WhatsApp com o texto pronto. O envio é manual — o sistema não envia mensagens sozinho.
                  </p>
                </div>
              )}

              {history.length > 0 && (
                <div>
                  <p className="label-caps mb-2 text-xs text-soft">Histórico</p>
                  <ul className="space-y-1 text-sm">
                    {history.map((h) => (
                      <li key={h.id} className="flex justify-between gap-3">
                        <span>{h.note}</span>
                        <span className="shrink-0 text-soft">{formatDateTimeBR(h.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {appointment.priceCents === null && active && (
                <Notice tone="info">Serviço sem preço fixo: o valor será informado ao concluir.</Notice>
              )}
            </>
          )}
        </div>
      </Modal>

      <CancelDialog
        appointment={appointment}
        actor={{ kind: "admin" }}
        open={mode === "cancel"}
        onClose={() => setMode("view")}
        onDone={onClose}
      />
      <RescheduleDialog
        appointment={appointment}
        actor={{ kind: "admin" }}
        open={mode === "reschedule"}
        onClose={() => setMode("view")}
        onDone={() => setMode("view")}
      />
    </>
  );
}
