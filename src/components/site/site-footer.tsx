"use client";

import Link from "next/link";
import { IconInstagram, IconPin, IconWhatsApp } from "@/components/ui/icons";
import { businessSchedule, groupedSchedule } from "@/domain/hours";
import { useBusiness } from "@/hooks/use-business";
import { track } from "@/lib/analytics";
import { Logo } from "./logo";

export function SiteFooter() {
  const { business, hours, addressLine, mapsUrl, whatsapp } = useBusiness();
  const schedule = groupedSchedule(businessSchedule(hours));

  return (
    <footer className="mt-24 border-t border-edge bg-panel">
      <div className="brass-rule" />
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.3fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-5 max-w-xs text-sm text-soft">
            {business.legalTagline}. Barba com toalha quente, cortes tradicionais e modernos, com horário
            agendado e pontual.
          </p>
          <div className="mt-6 flex gap-3">
            <a
              href={business.instagram.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram do Fio do Bigode"
              className="rounded border border-edge p-2.5 text-soft transition-colors hover:border-accent hover:text-accent-hi"
            >
              <IconInstagram />
            </a>
            <a
              href={whatsapp()}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp do Fio do Bigode"
              onClick={() => track("click_whatsapp", { origin: "footer" })}
              className="rounded border border-edge p-2.5 text-soft transition-colors hover:border-accent hover:text-accent-hi"
            >
              <IconWhatsApp />
            </a>
          </div>
        </div>

        <div>
          <h2 className="label-caps mb-4 text-sm text-accent-hi">Contato</h2>
          <address className="space-y-3 text-sm not-italic text-soft">
            <p className="flex gap-2.5">
              <IconPin className="mt-0.5 shrink-0 text-accent" />
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="hover:text-fg">
                {addressLine}
                <br />
                CEP {business.address.zip}
              </a>
            </p>
            <p className="flex gap-2.5">
              <IconWhatsApp className="mt-0.5 shrink-0 text-accent" />
              <a
                href={whatsapp()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("click_whatsapp", { origin: "footer_phone" })}
                className="hover:text-fg"
              >
                {business.whatsappDisplay}
              </a>
            </p>
            <p className="flex gap-2.5">
              <IconInstagram className="mt-0.5 shrink-0 text-accent" />
              <a href={business.instagram.url} target="_blank" rel="noopener noreferrer" className="hover:text-fg">
                @{business.instagram.handle}
              </a>
            </p>
          </address>
        </div>

        <div>
          <h2 className="label-caps mb-4 text-sm text-accent-hi">Horários</h2>
          <dl className="space-y-2 text-sm">
            {schedule.map((row) => (
              <div key={row.label} className="flex justify-between gap-4">
                <dt className="text-soft">{row.label}</dt>
                <dd className="tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="border-t border-edge">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-xs text-soft">
          <p>© {new Date().getFullYear()} Fio do Bigode Barbearia. Todos os direitos reservados.</p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href="/politica-de-privacidade" className="hover:text-fg">
              Política de privacidade
            </Link>
            <Link href="/termos" className="hover:text-fg">
              Termos de uso
            </Link>
            <Link href="/admin" className="hover:text-fg">
              Área da equipe
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
