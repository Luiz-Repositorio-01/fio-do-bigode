"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField, TextArea, TextField } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { computeSlots, uniqueStarts } from "@/domain/availability";
import { formatPhoneBR, normalizeWhatsApp } from "@/domain/whatsapp";
import { formatDateLong, minutesToHHmm, todayLocal } from "@/domain/time";
import { useNow } from "@/hooks/use-now";
import { SlotPicker } from "@/features/booking/slot-picker";
import { api } from "@/lib/api";
import { useAppState } from "@/lib/store/store";
import { availabilityContext, eligibleProfessionals } from "@/services/booking";
import { DomainError } from "@/services/errors";

/** Agendamento criado pela equipe (WhatsApp, telefone, balcão). Ignora a antecedência mínima. */
type NewBookingProps = {
  open: boolean;
  onClose: () => void;
  defaultDate?: string;
  defaultProfessionalId?: string;
  defaultCustomerId?: string;
  onCreated?: (appointmentId: string) => void;
};

export function NewBookingDialog(props: NewBookingProps) {
  // O corpo só existe com o diálogo aberto: cada abertura começa do zero.
  return props.open ? <NewBookingBody {...props} /> : null;
}

function NewBookingBody({
  open,
  onClose,
  defaultDate,
  defaultProfessionalId,
  defaultCustomerId,
  onCreated,
}: NewBookingProps) {
  const state = useAppState();
  const toast = useToast();
  const now = useNow(60_000);
  const services = useMemo(() => state.services.filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder), [state.services]);
  const existingDefault = defaultCustomerId ? state.customers.find((c) => c.id === defaultCustomerId) : undefined;

  const [serviceId, setServiceId] = useState(() => services[0]?.id ?? "");
  const [professionalId, setProfessionalId] = useState(defaultProfessionalId ?? "any");
  const [date, setDate] = useState(() => defaultDate ?? todayLocal(now));
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [name, setName] = useState(existingDefault?.name ?? "");
  const [whatsapp, setWhatsapp] = useState(existingDefault ? formatPhoneBR(existingDefault.whatsapp) : "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const service = services.find((s) => s.id === serviceId);
  const pros = useMemo(
    () => (service ? eligibleProfessionals(state, service.id) : []),
    [state, service],
  );
  const normalized = normalizeWhatsApp(whatsapp);
  const existing = normalized ? state.customers.find((c) => c.whatsapp === normalized) : undefined;

  const slots = useMemo(() => {
    if (!service) return [];
    const ctx = availabilityContext(state, now);
    const list = professionalId === "any" ? pros : pros.filter((p) => p.id === professionalId);
    const all = computeSlots(ctx, date, service, list, { ignoreNotice: true });
    return professionalId === "any" ? uniqueStarts(all) : all;
  }, [state, service, pros, professionalId, date, now]);

  async function submit() {
    if (!service || !startsAt) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const r = await api.createBooking(
        {
          serviceId: service.id,
          professionalId,
          startsAt,
          name: existing?.name ?? name,
          whatsapp,
          notes,
        },
        { source: "admin" },
      );
      toast(`Agendamento criado para ${r.customer.name}.`);
      onCreated?.(r.appointment.id);
      onClose();
    } catch (e) {
      if (e instanceof DomainError) {
        setError(e.message);
        setFields(e.fields ?? {});
      } else setError("Não foi possível criar o agendamento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo agendamento"
      description="Para clientes que chamam no WhatsApp, telefone ou balcão."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={submit} loading={busy} disabled={!startsAt || !service}>Criar agendamento</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Serviço"
          value={serviceId}
          onChange={(e) => {
            setServiceId(e.target.value);
            setStartsAt(null);
          }}
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </SelectField>
        <SelectField
          label="Profissional"
          value={professionalId}
          onChange={(e) => {
            setProfessionalId(e.target.value);
            setStartsAt(null);
          }}
        >
          <option value="any">Qualquer disponível</option>
          {pros.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </SelectField>
        <TextField
          label="Data"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setStartsAt(null);
          }}
          wrapperClassName="sm:col-span-2"
        />
      </div>

      <div className="mt-5" aria-live="polite">
        {service && date ? (
          slots.length === 0 ? (
            <p className="rounded-md border border-dashed border-edge p-5 text-center text-soft">
              Sem horários livres em {formatDateLong(date)}.
            </p>
          ) : (
            <SlotPicker slots={slots} value={startsAt} onChange={(s) => setStartsAt(s.startsAt)} />
          )
        ) : null}
        {startsAt && (
          <p className="mt-3 text-sm text-soft">
            Horário escolhido: {formatDateLong(date)} às {minutesToHHmm(slots.find((s) => s.startsAt === startsAt)?.startMin ?? 0)}
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-4 border-t border-edge pt-5 sm:grid-cols-2">
        <TextField
          label="WhatsApp do cliente"
          type="tel"
          inputMode="tel"
          placeholder="(19) 99999-9999"
          value={whatsapp}
          error={fields.whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
        />
        {existing ? (
          <div className="self-end pb-2 text-sm">
            <span className="text-soft">Cliente cadastrado:</span> <strong>{existing.name}</strong>
          </div>
        ) : (
          <TextField label="Nome" value={name} error={fields.name} onChange={(e) => setName(e.target.value)} />
        )}
        <TextArea
          label="Observação"
          optional
          maxLength={300}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          wrapperClassName="sm:col-span-2"
        />
      </div>
      {error && <div className="mt-4"><Notice tone="bad">{error}</Notice></div>}
    </Modal>
  );
}
