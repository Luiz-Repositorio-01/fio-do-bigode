"use client";

import { usePathname } from "next/navigation";
import { IconWhatsApp } from "@/components/ui/icons";
import { useBusiness } from "@/hooks/use-business";
import { track } from "@/lib/analytics";

export function WhatsAppFab() {
  const { whatsapp } = useBusiness();
  const pathname = usePathname();
  // Nas telas de agendamento o botão cobria horários e campos; ali o WhatsApp já aparece na confirmação.
  if (pathname.startsWith("/agendar") || pathname.startsWith("/agendamento")) return null;
  return (
    <a
      href={whatsapp("Olá! Vim pelo site do Fio do Bigode e gostaria de falar com a barbearia.")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com a barbearia no WhatsApp"
      onClick={() => track("click_whatsapp", { origin: "floating_button" })}
      className="fixed right-4 bottom-4 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#1f9d55] text-white shadow-[0_8px_24px_rgba(0,0,0,.45)] transition-transform hover:scale-105 sm:right-6 sm:bottom-6"
    >
      <IconWhatsApp width={28} height={28} />
    </a>
  );
}
