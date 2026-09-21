"use client";

import { useEffect } from "react";
import { LinkButton } from "@/components/ui/button";
import { IconArrow } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/misc";
import { firstName } from "@/domain/whatsapp";
import { track } from "@/lib/analytics";
import { saveReferralCode } from "@/lib/store/session";
import { useAppState, useHydrated } from "@/lib/store/store";

/** Destino do link /indique/CODIGO: guarda o código neste aparelho e leva ao agendamento. */
export function ReferralLanding({ code }: { code: string }) {
  const hydrated = useHydrated();
  const { customers, settings } = useAppState();
  const normalized = code.toUpperCase();
  const referrer = customers.find((c) => c.referralCode === normalized) ?? null;
  const cfg = settings.loyalty.referral;
  const programOn = settings.loyalty.enabled && cfg.enabled;

  useEffect(() => {
    if (hydrated && referrer) {
      saveReferralCode(normalized);
      track("referral_visit", { code: normalized });
    }
  }, [hydrated, referrer, normalized]);

  if (!hydrated) return <Skeleton className="h-72 w-full" />;

  return (
    <div className="mx-auto max-w-xl text-center">
      {referrer ? (
        <>
          <p className="label-caps text-sm text-accent-hi">Convite</p>
          <h1 className="display mt-3 text-[clamp(2rem,5vw,3.2rem)] leading-[1.05] text-balance">
            {firstName(referrer.name)} indicou você para o Fio do Bigode.
          </h1>
          <p className="mt-5 text-lg text-soft">
            {programOn && cfg.refereePoints > 0
              ? `Faça seu primeiro atendimento e ganhe ${cfg.refereePoints} pontos no programa de fidelidade.`
              : "Agende seu primeiro horário e conheça a barbearia."}
          </p>
        </>
      ) : (
        <>
          <h1 className="display text-[clamp(2rem,5vw,3.2rem)] leading-[1.05] text-balance">
            Não encontramos esse convite.
          </h1>
          <p className="mt-5 text-lg text-soft">O código pode ter sido digitado errado, mas você ainda pode agendar normalmente.</p>
        </>
      )}
      <LinkButton href="/agendar" size="lg" className="mt-8" onClick={() => track("start_booking", { origin: "referral" })}>
        Agendar horário <IconArrow />
      </LinkButton>
      {referrer && programOn && (
        <p className="mt-6 text-xs text-soft">
          Os pontos são liberados quando o primeiro atendimento é concluído. Condições do programa em{" "}
          <a href="/fidelidade" className="underline underline-offset-4">Fidelidade</a>.
        </p>
      )}
    </div>
  );
}
