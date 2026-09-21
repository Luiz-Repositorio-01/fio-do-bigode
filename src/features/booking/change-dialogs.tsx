"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/misc";
import { TextField } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { computeSlots, daysWithAvailability } from "@/domain/availability";
import { formatDateLong, minutesToHHmm, todayLocal, toLocalParts } from "@/domain/time";
import { useNow } from "@/hooks/use-now";
import { api } from "@/lib/api";
import { useAppState } from "@/lib/store/store";
import { availabilityContext } from "@/services/booking";
import { DomainError } from "@/services/errors";
import type { Appointment } from "@/types";
import { DatePicker } from "./date-picker";
import { SlotPicker } from "./slot-picker";

export type ChangeActor =
  | { kind: "admin" }
  | { kind: "customer"; customerId?: string; token?: string };

export function CancelDialog({
  appointment,
  actor,
  open,
  onClose,
  onDone,
}: {
  appointment: Appointment;
  actor: ChangeActor;
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const local = toLocalParts(appointment.startsAt);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api.cancelAppointment(appointment.id, actor, reason);
      toast("Agendamento cancelado.");
      onClose();
      onDone?.();
    } catch (e) {
      setError(e instanceof DomainError ? e.message : "Não foi possível cancelar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancelar agendamento?"
      description={`${appointment.serviceName} · ${formatDateLong(local.date)} às ${minutesToHHmm(local.minutes)}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Manter horário</Button>
          <Button variant="danger" onClick={confirm} loading={busy}>Cancelar agendamento</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-soft">O horário será liberado para outros clientes.</p>
        <TextField
          label="Motivo"
          optional
          maxLength={120}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {error && <Notice tone="bad">{error}</Notice>}
      </div>
    </Modal>
  );
}

export function RescheduleDialog({
  appointment,
  actor,
  open,
  onClose,
  onDone,
}: {
  appointment: Appointment;
  actor: ChangeActor;
  open: boolean;
  onClose: () => void;
  onDone?: (a: Appointment) => void;
}) {
  const state = useAppState();
  const toast = useToast();
  const now = useNow();
  const [date, setDate] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const service = state.services.find((s) => s.id === appointment.serviceId);
  const pro = state.professionals.find((p) => p.id === appointment.professionalId);
  const isAdmin = actor.kind === "admin";

  const ctx = useMemo(() => availabilityContext(state, now), [state, now]);
  const opts = useMemo(
    () => ({ excludeAppointmentId: appointment.id, ignoreNotice: isAdmin }),
    [appointment.id, isAdmin],
  );

  const availability = useMemo(() => {
    if (!service || !pro) return {};
    const days = state.settings.bookingWindowDays + 1;
    const out = daysWithAvailability(
      { ...ctx, appointments: ctx.appointments.filter((a) => a.id !== appointment.id) },
      service,
      [pro],
      todayLocal(now),
      days,
    );
    return out;
  }, [ctx, service, pro, now, appointment.id, state.settings.bookingWindowDays]);

  const slots = useMemo(
    () => (service && pro && date ? computeSlots(ctx, date, service, [pro], opts) : []),
    [ctx, service, pro, date, opts],
  );

  async function confirm() {
    if (!startsAt) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.rescheduleAppointment({ appointmentId: appointment.id, newStartsAt: startsAt, actor });
      toast("Agendamento remarcado.");
      onClose();
      onDone?.(updated);
    } catch (e) {
      setError(e instanceof DomainError ? e.message : "Não foi possível remarcar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Remarcar horário"
      description={`${appointment.serviceName}${pro ? ` com ${pro.name}` : ""}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Voltar</Button>
          <Button onClick={confirm} loading={busy} disabled={!startsAt}>Confirmar novo horário</Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <DatePicker
          value={date}
          onChange={(d) => {
            setDate(d);
            setStartsAt(null);
          }}
          availability={availability}
          windowDays={state.settings.bookingWindowDays}
          now={now}
        />
        <div aria-live="polite">
          {!date ? (
            <p className="rounded-md border border-dashed border-edge p-6 text-center text-soft">Escolha uma nova data.</p>
          ) : slots.length === 0 ? (
            <p className="rounded-md border border-dashed border-edge p-6 text-center text-soft">Sem horários neste dia.</p>
          ) : (
            <>
              <p className="display mb-3 text-lg first-letter:uppercase">{formatDateLong(date)}</p>
              <SlotPicker slots={slots} value={startsAt} onChange={(s) => setStartsAt(s.startsAt)} />
            </>
          )}
        </div>
      </div>
      {error && <div className="mt-4"><Notice tone="bad">{error}</Notice></div>}
    </Modal>
  );
}
