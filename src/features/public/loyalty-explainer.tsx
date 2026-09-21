"use client";

import { LinkButton } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { useAppState } from "@/lib/store/store";

const num = (n: number) => n.toLocaleString("pt-BR");

/** Explica o programa a partir das regras REAIS configuradas no admin. */
export function LoyaltyExplainer() {
  const { settings, levels, rewards } = useAppState();
  const l = settings.loyalty;
  const sorted = [...levels].sort((a, b) => a.minPoints - b.minPoints);
  const activeRewards = rewards.filter((r) => r.active).sort((a, b) => a.costPoints - b.costPoints);

  if (!l.enabled) {
    return <Notice tone="info">O programa de fidelidade está temporariamente desativado.</Notice>;
  }

  const earn: string[] = [];
  if (l.model !== "visits") {
    if (l.pointsPerReal > 0) earn.push(`${num(l.pointsPerReal)} ponto${l.pointsPerReal === 1 ? "" : "s"} a cada R$ 1,00 gasto em atendimentos`);
    if (l.pointsPerVisit > 0) earn.push(`${num(l.pointsPerVisit)} pontos por visita concluída`);
  }
  if (l.model !== "points" && l.visitsGoal > 0) {
    const reward = rewards.find((r) => r.id === l.visitsRewardId);
    earn.push(`A cada ${l.visitsGoal} visitas concluídas${reward ? `: ${reward.name}` : ", um benefício da casa"}`);
  }
  if (l.referral.enabled && l.referral.referrerPoints > 0) {
    earn.push(`${num(l.referral.referrerPoints)} pontos quando um amigo indicado conclui o primeiro atendimento`);
  }
  if (l.birthdayBonusPoints > 0) earn.push(`${num(l.birthdayBonusPoints)} pontos de presente no seu aniversário`);

  return (
    <div className="space-y-16">
      <div className="grid gap-6 md:grid-cols-3">
        {[
          { n: "1", t: "Atenda-se", d: "Cada atendimento concluído fica registrado na sua conta." },
          { n: "2", t: "Acumule", d: "Os pontos entram no seu extrato. Você acompanha cada movimentação." },
          { n: "3", t: "Aproveite", d: "Suba de nível e resgate as recompensas disponíveis." },
        ].map((s) => (
          <div key={s.n} className="rounded-md border border-edge bg-panel p-6">
            <span className="display text-4xl text-accent">{s.n}</span>
            <h3 className="display mt-3 text-xl">{s.t}</h3>
            <p className="mt-1.5 text-[15px] text-soft">{s.d}</p>
          </div>
        ))}
      </div>

      {earn.length > 0 && (
        <section aria-labelledby="ganhar">
          <h2 id="ganhar" className="display text-3xl">Como ganhar</h2>
          <ul className="mt-5 space-y-2.5">
            {earn.map((e) => (
              <li key={e} className="flex gap-3 border-b border-edge pb-2.5 text-lg">
                <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                {e}
              </li>
            ))}
          </ul>
          {l.pointsValidityDays && (
            <p className="mt-4 text-sm text-soft">Os pontos têm validade de {l.pointsValidityDays} dias.</p>
          )}
        </section>
      )}

      <section aria-labelledby="niveis">
        <h2 id="niveis" className="display text-3xl">Níveis</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {sorted.map((lv, i) => (
            <div key={lv.id} className="rounded-md border border-edge bg-panel p-5">
              <p className="label-caps text-xs text-accent-hi">{i === 0 ? "Ponto de partida" : `${num(lv.minPoints)} pontos`}</p>
              <p className="display mt-1 text-2xl">{lv.name}</p>
              <p className="mt-2 text-sm text-soft">
                {lv.benefits ||
                  (lv.discountPercent ? `${lv.discountPercent}% de desconto` : "Benefícios deste nível serão divulgados pela barbearia.")}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="recompensas">
        <h2 id="recompensas" className="display text-3xl">Recompensas</h2>
        {activeRewards.length === 0 ? (
          <div className="mt-5">
            <Notice tone="info" title="Em definição">
              A barbearia ainda vai divulgar as recompensas disponíveis. Seus pontos já ficam guardados.
            </Notice>
          </div>
        ) : (
          <ul className="mt-5 grid gap-4 md:grid-cols-2">
            {activeRewards.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-4 rounded-md border border-edge bg-panel p-5">
                <div>
                  <p className="display text-xl">{r.name}</p>
                  {r.description && <p className="mt-1 text-sm text-soft">{r.description}</p>}
                </div>
                <p className="label-caps shrink-0 text-sm text-accent-hi">{num(r.costPoints)} pts</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-col items-start gap-3 sm:flex-row">
        <LinkButton href="/minha-conta/fidelidade" size="lg">Ver meus pontos</LinkButton>
        <LinkButton href="/agendar" size="lg" variant="secondary">Agendar horário</LinkButton>
      </div>
    </div>
  );
}
