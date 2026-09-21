"use client";

import { AnchorButton, Button } from "@/components/ui/button";
import { IconCalendar, IconDownload, IconPin, IconWhatsApp } from "@/components/ui/icons";
import { buildICS, googleCalendarUrl, type CalendarEvent } from "@/domain/calendar";
import { firstName } from "@/domain/whatsapp";
import { formatDateLong, minutesToHHmm, toLocalParts } from "@/domain/time";
import { useBusiness } from "@/hooks/use-business";
import { track } from "@/lib/analytics";
import type { Appointment, Customer, Professional } from "@/types";

export function useCalendarEvent(appointment: Appointment, professional?: Professional | null): CalendarEvent {
  const { business, fullAddress } = useBusiness();
  return {
    uid: appointment.id,
    title: `${appointment.serviceName} — ${business.name}`,
    description: `${appointment.serviceName}${professional ? ` com ${professional.name}` : ""}. ${business.name} · WhatsApp ${business.whatsappDisplay}`,
    location: fullAddress,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
  };
}

/** Mensagem do CLIENTE para a barbearia (a barbearia envia a de confirmação pelo admin). */
export function customerToShopMessage(a: Appointment, customer: Customer, professional?: Professional | null) {
  const local = toLocalParts(a.startsAt);
  return `Olá! Sou ${firstName(customer.name)} e agendei pelo site do Fio do Bigode.\nServiço: ${a.serviceName}\nProfissional: ${professional?.name ?? "Qualquer disponível"}\nData: ${formatDateLong(local.date)}\nHorário: ${minutesToHHmm(local.minutes)}`;
}

export function BookingActions({
  appointment,
  customer,
  professional,
}: {
  appointment: Appointment;
  customer: Customer;
  professional?: Professional | null;
}) {
  const { whatsapp, mapsUrl } = useBusiness();
  const event = useCalendarEvent(appointment, professional);

  function downloadIcs() {
    const blob = new Blob([buildICS(event)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fio-do-bigode.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Button onClick={downloadIcs} variant="secondary">
        <IconDownload width={18} height={18} /> Adicionar ao calendário
      </Button>
      <AnchorButton href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" variant="secondary">
        <IconCalendar width={18} height={18} /> Google Agenda
      </AnchorButton>
      <AnchorButton
        href={whatsapp(customerToShopMessage(appointment, customer, professional))}
        target="_blank"
        rel="noopener noreferrer"
        variant="whatsapp"
        onClick={() => track("click_whatsapp", { origin: "booking_confirmation" })}
      >
        <IconWhatsApp width={18} height={18} /> Falar no WhatsApp
      </AnchorButton>
      <AnchorButton href={mapsUrl} target="_blank" rel="noopener noreferrer" variant="secondary">
        <IconPin width={18} height={18} /> Como chegar
      </AnchorButton>
    </div>
  );
}
