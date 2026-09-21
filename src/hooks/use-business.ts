"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/lib/store/store";
import { openStatus, type OpenStatus } from "@/domain/hours";
import { waLink } from "@/domain/whatsapp";
import { mapsSearchUrl } from "@/domain/calendar";

/** Dados públicos da barbearia + atalhos de contato (sempre a partir do estado). */
export function useBusiness() {
  const { business, hours } = useAppState();
  return useMemo(() => {
    const addressLine = `${business.address.street} - ${business.address.neighborhood}, ${business.address.city}/${business.address.state}`;
    const fullAddress = `${business.address.street}, ${business.address.neighborhood}, ${business.address.city} - ${business.address.state}, ${business.address.zip}`;
    return {
      business,
      hours,
      addressLine,
      fullAddress,
      mapsUrl: mapsSearchUrl(fullAddress),
      whatsapp: (text?: string) => waLink(business.whatsappE164, text),
    };
  }, [business, hours]);
}

/** Status "aberto/fechado" atualizado a cada minuto (só no cliente). */
export function useOpenStatus(): OpenStatus | null {
  const { hours } = useAppState();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  return useMemo(() => (now === null ? null : openStatus(hours, now)), [hours, now]);
}
