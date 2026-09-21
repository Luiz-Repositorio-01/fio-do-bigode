"use client";

import { LinkButton } from "@/components/ui/button";
import { IconArrow, IconGift, IconStar } from "@/components/ui/icons";
import { useAppState } from "@/lib/store/store";

export function LoyaltyTeaser() {
  const { levels, settings } = useAppState();
  const sorted = [...levels].sort((a, b) => a.minPoints - b.minPoints);

  if (!settings.loyalty.enabled) return null;
  return (
    <div className="grain relative grid gap-7 overflow-hidden rounded-md border border-accent/30 bg-wood p-5 sm:p-7 md:grid-cols-[1.1fr_.9fr] md:gap-10 md:p-12">
      <div className="relative">
        <p className="label-caps text-sm text-accent-hi">Programa de fidelidade</p>
        <h2 className="display mt-3 text-[clamp(1.7rem,4vw,2.9rem)] leading-[1.08]">
          Cada visita aproxima você de novos benefícios.
        </h2>
        <p className="mt-4 max-w-md text-soft">
          Seus atendimentos ficam registrados na sua conta. Acumule pontos, suba de nível e resgate as
          recompensas que a barbearia disponibilizar.
        </p>
        <LinkButton href="/fidelidade" variant="secondary" className="mt-7">
          Como funciona <IconArrow />
        </LinkButton>
      </div>
      <ol className="relative grid grid-cols-2 gap-2.5 md:block md:space-y-2.5" aria-label="Níveis do programa">
        {sorted.map((l, i) => (
          <li
            key={l.id}
            className="flex flex-col items-start gap-1.5 rounded border border-edge bg-bg/50 px-3.5 py-3 md:flex-row md:items-center md:justify-between md:px-4"
          >
            <span className="flex items-center gap-3">
              {l.isVip ? (
                <IconStar className="text-accent-hi" width={18} height={18} />
              ) : (
                <IconGift className="text-accent" width={18} height={18} />
              )}
              <span className="display text-lg">{l.name}</span>
            </span>
            <span className="label-caps text-[11px] text-soft md:text-xs">
              {i === 0 ? "Ao se cadastrar" : `${l.minPoints} pontos`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
