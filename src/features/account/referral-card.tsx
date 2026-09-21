"use client";

import { useState } from "react";
import { AnchorButton, Button } from "@/components/ui/button";
import { IconCopy, IconGift, IconWhatsApp } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { track } from "@/lib/analytics";
import { useAppState } from "@/lib/store/store";
import type { Customer } from "@/types";

export function ReferralCard({ customer }: { customer: Customer }) {
  const { settings } = useAppState();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const cfg = settings.loyalty.referral;
  if (!settings.loyalty.enabled || !cfg.enabled) return null;

  const link = `${typeof window === "undefined" ? "" : window.location.origin}/indique/${customer.referralCode}`;
  const message = `Corte e barba no Fio do Bigode, em Piracicaba. Agende pelo meu link: ${link}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      track("referral_created", { origin: "copy" });
      toast("Link copiado.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Não foi possível copiar. Selecione o link manualmente.", "error");
    }
  }

  return (
    <section className="rounded-md border border-accent/30 bg-panel p-5" aria-labelledby="indique">
      <div className="flex items-center gap-2 text-accent-hi">
        <IconGift />
        <h2 id="indique" className="label-caps text-sm">Indique um amigo</h2>
      </div>
      <p className="mt-2 text-soft">
        {cfg.referrerPoints > 0
          ? `Você ganha ${cfg.referrerPoints} pontos quando seu amigo concluir o primeiro atendimento.`
          : "Compartilhe seu link com amigos."}
        {cfg.refereePoints > 0 && ` Ele também ganha ${cfg.refereePoints} pontos.`}
      </p>
      <div className="mt-4 flex items-center gap-2 rounded border border-edge bg-bg px-3 py-2 text-sm">
        <span className="truncate font-mono text-[13px]" title={link}>{link}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={copy}>
          <IconCopy width={16} height={16} /> {copied ? "Copiado" : "Copiar link"}
        </Button>
        <AnchorButton
          size="sm"
          variant="whatsapp"
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("referral_created", { origin: "whatsapp_share" })}
        >
          <IconWhatsApp width={16} height={16} /> Enviar por WhatsApp
        </AnchorButton>
      </div>
    </section>
  );
}
