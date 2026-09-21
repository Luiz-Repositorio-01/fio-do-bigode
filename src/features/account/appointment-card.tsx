"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDuration, formatPrice } from "@/domain/pricing";
import { formatDateLong, minutesToHHmm, toLocalParts } from "@/domain/time";
import { useAppState } from "@/lib/store/store";
import { CancelDialog, RescheduleDialog } from "@/features/booking/change-dialogs";
import { StatusBadge } from "@/features/booking/status";
import type { Appointment } from "@/types";

export function AppointmentCard({ appointment, customerId, actions = true }: { appointment: Appointment; customerId: string; actions?: boolean }) {
  const { professionals, settings } = useAppState();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [resOpen, setResOpen] = useState(false);
  const pro = professionals.find((p) => p.id === appointment.professionalId);
  const local = toLocalParts(appointment.startsAt);
  const active = appointment.status === "pending" || appointment.status === "confirmed";
  const actor = { kind: "customer" as const, customerId };

  return (
    <article className="rounded-md border border-edge bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="display text-2xl first-letter:uppercase">
            {formatDateLong(local.date)} · {minutesToHHmm(local.minutes)}
          </p>
          <p className="mt-1 text-soft">
            {appointment.serviceName}
            {pro ? ` · ${pro.name}` : ""} · {formatDuration(appointment.durationMinutes)}
          </p>
        </div>
        <StatusBadge status={appointment.status} />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-4">
        <p className="display text-lg tabular-nums">
          {appointment.status === "completed"
            ? formatPrice(appointment.finalPriceCents ?? appointment.priceCents, false)
            : formatPrice(appointment.priceCents, appointment.priceIsStartingAt)}
        </p>
        {actions && active && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setResOpen(true)}>Remarcar</Button>
            <Button size="sm" variant="danger" onClick={() => setCancelOpen(true)}>Cancelar</Button>
          </div>
        )}
      </div>
      {actions && active && (
        <>
          <p className="mt-2 text-xs text-soft">
            Alterações pelo site até {settings.customerChangeLimitHours}h antes do horário.
          </p>
          <CancelDialog appointment={appointment} actor={actor} open={cancelOpen} onClose={() => setCancelOpen(false)} />
          <RescheduleDialog appointment={appointment} actor={actor} open={resOpen} onClose={() => setResOpen(false)} />
        </>
      )}
    </article>
  );
}
