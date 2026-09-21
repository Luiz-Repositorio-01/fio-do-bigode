"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState, Notice, Skeleton } from "@/components/ui/misc";
import { useAppState, useHydrated } from "@/lib/store/store";
import { StatusBadge } from "./status";
import { AppointmentDetails } from "./appointment-details";
import { BookingActions } from "./booking-actions";
import { CancelDialog, RescheduleDialog } from "./change-dialogs";

/** Página secreta (por token) para consultar, cancelar ou remarcar SEM login. */
export function ManageAppointment({ token }: { token: string }) {
  const state = useAppState();
  const hydrated = useHydrated();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const appointment = state.appointments.find((a) => a.manageToken === token);
  const customer = appointment ? state.customers.find((c) => c.id === appointment.customerId) : null;
  if (!appointment || !customer) {
    return (
      <div className="mx-auto max-w-xl">
        <EmptyState
          title="Agendamento não encontrado"
          description="O link pode estar incorreto ou o agendamento não existe mais neste navegador."
          action={<LinkButton href="/agendar">Fazer um agendamento</LinkButton>}
        />
      </div>
    );
  }
  const professional = state.professionals.find((p) => p.id === appointment.professionalId) ?? null;
  const active = appointment.status === "pending" || appointment.status === "confirmed";
  const actor = { kind: "customer" as const, token };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-4xl">Seu agendamento</h1>
        <StatusBadge status={appointment.status} />
      </div>

      <AppointmentDetails
        appointment={appointment}
        professional={professional}
        address={`${state.business.address.street}, ${state.business.address.neighborhood} — ${state.business.address.city}/${state.business.address.state}`}
      />

      {active ? (
        <>
          <div className="mt-6">
            <BookingActions appointment={appointment} customer={customer} professional={professional} />
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button variant="secondary" className="sm:flex-1" onClick={() => setRescheduleOpen(true)}>Remarcar</Button>
            <Button variant="danger" className="sm:flex-1" onClick={() => setCancelOpen(true)}>Cancelar</Button>
          </div>
          <p className="mt-3 text-xs text-soft">
            Alterações pelo site são permitidas até {state.settings.customerChangeLimitHours}h antes do horário.
          </p>
          <CancelDialog appointment={appointment} actor={actor} open={cancelOpen} onClose={() => setCancelOpen(false)} />
          <RescheduleDialog appointment={appointment} actor={actor} open={rescheduleOpen} onClose={() => setRescheduleOpen(false)} />
        </>
      ) : (
        <div className="mt-6">
          <Notice>
            Este agendamento está {appointment.status === "completed" ? "concluído" : "encerrado"}.{" "}
            <Link href="/agendar" className="text-accent-hi underline underline-offset-4">Agendar um novo horário</Link>
          </Notice>
        </div>
      )}
    </div>
  );
}
