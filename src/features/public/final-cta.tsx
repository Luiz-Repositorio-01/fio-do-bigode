"use client";

import { LinkButton } from "@/components/ui/button";
import { IconArrow } from "@/components/ui/icons";
import { track } from "@/lib/analytics";

export function FinalCta({ title = "Seu próximo corte já tem horário." }: { title?: string }) {
  return (
    <section className="grain relative isolate overflow-hidden border-y border-edge bg-wood">
      <div className="pole pole-anim absolute inset-x-0 top-0 h-1.5 opacity-80" aria-hidden />
      <div className="mx-auto flex max-w-6xl flex-col items-center px-5 py-14 text-center md:py-20">
        <h2 className="display max-w-2xl text-[clamp(2rem,5vw,3.6rem)] leading-[1.05] text-balance">{title}</h2>
        <p className="mt-4 max-w-md text-soft">Escolha serviço, profissional e horário em menos de um minuto.</p>
        <LinkButton
          href="/agendar"
          size="lg"
          className="mt-8"
          onClick={() => track("start_booking", { origin: "final_cta" })}
        >
          Agendar horário <IconArrow />
        </LinkButton>
      </div>
    </section>
  );
}
