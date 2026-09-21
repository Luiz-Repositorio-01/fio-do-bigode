"use client";

import { AnchorButton, LinkButton } from "@/components/ui/button";
import { IconArrow, IconStar, IconWhatsApp } from "@/components/ui/icons";
import { useBusiness, useOpenStatus } from "@/hooks/use-business";
import { track } from "@/lib/analytics";

export function Hero() {
  const { business, whatsapp } = useBusiness();
  const status = useOpenStatus();

  return (
    <section className="grain relative isolate overflow-hidden border-b border-edge">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_75%_20%,rgba(201,153,63,.16),transparent_55%),linear-gradient(180deg,#1b130d,#0f0c0a)]" />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-14 pb-16 md:pt-20 md:pb-24 lg:grid-cols-[1.15fr_.85fr]">
        <div className="animate-rise">
          <p className="label-caps mb-5 flex items-center gap-3 text-sm text-accent-hi">
            <span className="pole pole-anim inline-block h-3.5 w-9 rounded-[2px]" aria-hidden />
            Barbearia · São Dimas, Piracicaba
          </p>
          <h1 className="display text-[clamp(2.7rem,7.4vw,5.6rem)] leading-[0.98] text-balance">
            A mais clássica
            <br />
            de <em className="text-accent-hi not-italic">Piracicaba.</em>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-soft md:text-xl">
            Barba feita com toalha quente, cortes tradicionais e modernos e acabamento impecável. Com horário
            agendado e pontual.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/agendar" size="lg" onClick={() => track("start_booking", { origin: "hero" })}>
              Agendar horário
              <IconArrow />
            </LinkButton>
            <AnchorButton
              href={whatsapp("Olá! Vim pelo site do Fio do Bigode e gostaria de falar com a barbearia.")}
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
              size="lg"
              onClick={() => track("click_whatsapp", { origin: "hero" })}
            >
              <IconWhatsApp width={20} height={20} />
              Falar no WhatsApp
            </AnchorButton>
          </div>

          <dl className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
            {business.rating && (
              <div className="flex items-center gap-2">
                <dt className="sr-only">Avaliação</dt>
                <dd className="flex items-center gap-2">
                  <span className="flex text-accent-hi" aria-hidden>
                    {Array.from({ length: 5 }, (_, i) => (
                      <IconStar key={i} width={16} height={16} />
                    ))}
                  </span>
                  <span>
                    <strong className="tabular-nums">
                      {business.rating.value.toFixed(1).replace(".", ",")}
                    </strong>{" "}
                    <a
                      href={business.rating.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-soft underline decoration-edge underline-offset-4 hover:text-fg"
                    >
                      {business.rating.count} avaliações no {business.rating.source}
                    </a>
                  </span>
                </dd>
              </div>
            )}
            <div className="flex items-center gap-2 min-h-6">
              <dt className="sr-only">Situação agora</dt>
              <dd className="flex items-center gap-2">
                {status ? (
                  <>
                    <span
                      aria-hidden
                      className={`h-2.5 w-2.5 rounded-full ${status.isOpen ? "bg-good shadow-[0_0_0_4px_rgba(143,189,120,.18)]" : "bg-soft"}`}
                    />
                    <span>{status.label}</span>
                  </>
                ) : (
                  <span className="inline-block h-4 w-44 animate-pulse-soft rounded bg-panel-2" />
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className="relative mx-auto flex w-full max-w-xs items-center justify-center sm:max-w-sm lg:max-w-none">
          <div
            className="pointer-events-none absolute inset-[-12%] -z-10 bg-[radial-gradient(closest-side,rgba(201,153,63,.28),rgba(201,153,63,.08)_55%,transparent_75%)]"
            aria-hidden
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-transparente.webp"
            alt="Fio do Bigode Barbearia — logotipo com duas navalhas cruzadas sobre um triângulo"
            width={1000}
            height={1128}
            fetchPriority="high"
            className="animate-rise h-auto w-full max-w-[460px] drop-shadow-[0_18px_40px_rgba(0,0,0,.55)]"
          />
        </div>
      </div>
    </section>
  );
}
