"use client";

import { IconCalendar, IconClock, IconPin, IconScissors, IconUser } from "@/components/ui/icons";
import { formatDuration, formatPrice } from "@/domain/pricing";
import { formatDateLong, minutesToHHmm, toLocalParts } from "@/domain/time";
import type { Appointment, Professional } from "@/types";

/** Resumo de um agendamento (usado na confirmação, no link de gerenciamento e na conta). */
export function AppointmentDetails({
  appointment,
  professional,
  professionalLabel,
  address,
}: {
  appointment: Pick<
    Appointment,
    "serviceName" | "startsAt" | "durationMinutes" | "priceCents" | "priceIsStartingAt"
  >;
  professional?: Pick<Professional, "name"> | null;
  /** Ex.: "Qualquer profissional disponível" antes da confirmação. */
  professionalLabel?: string;
  address?: string;
}) {
  const local = toLocalParts(appointment.startsAt);
  const rows = [
    { icon: IconScissors, label: "Serviço", value: appointment.serviceName },
    { icon: IconUser, label: "Profissional", value: professional?.name ?? professionalLabel ?? "—" },
    { icon: IconCalendar, label: "Data", value: formatDateLong(local.date) },
    {
      icon: IconClock,
      label: "Horário",
      value: `${minutesToHHmm(local.minutes)} · ${formatDuration(appointment.durationMinutes)}`,
    },
  ];
  return (
    <dl className="divide-y divide-edge rounded-md border border-edge bg-panel">
      {rows.map((r) => (
        <div key={r.label} className="flex items-start gap-4 px-5 py-3.5">
          <r.icon className="mt-0.5 shrink-0 text-accent" />
          <div className="flex-1">
            <dt className="label-caps text-[11px] text-soft">{r.label}</dt>
            <dd className="first-letter:uppercase text-[16px]">{r.value}</dd>
          </div>
        </div>
      ))}
      {address && (
        <div className="flex items-start gap-4 px-5 py-3.5">
          <IconPin className="mt-0.5 shrink-0 text-accent" />
          <div className="flex-1">
            <dt className="label-caps text-[11px] text-soft">Endereço</dt>
            <dd>{address}</dd>
          </div>
        </div>
      )}
      <div className="flex items-baseline justify-between gap-4 px-5 py-3.5">
        <dt className="label-caps text-[11px] text-soft">Valor</dt>
        <dd className="display text-xl tabular-nums">
          {formatPrice(appointment.priceCents, appointment.priceIsStartingAt)}
        </dd>
      </div>
    </dl>
  );
}
