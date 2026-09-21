"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge, EmptyState, Notice, StatCard } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { redeemBlock } from "@/domain/loyalty";
import { formatDateBR, toLocalParts } from "@/domain/time";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { DomainError } from "@/services/errors";
import type { LoyaltyReward, LoyaltyTransactionType } from "@/types";
import { Progress } from "./account-home";
import { useCustomer } from "./use-customer";

const TYPE_LABEL: Record<LoyaltyTransactionType, string> = {
  EARN: "Ganho",
  REDEEM: "Resgate",
  ADJUSTMENT: "Ajuste",
  EXPIRE: "Expirado",
  BONUS: "Bônus",
};

const num = (n: number) => n.toLocaleString("pt-BR");

export function LoyaltyView() {
  const ctx = useCustomer();
  const toast = useToast();
  const [target, setTarget] = useState<LoyaltyReward | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  if (!ctx.customer) return null;
  const { customer, loyalty, ledger, state } = ctx;
  const cfg = state.settings.loyalty;

  if (!cfg.enabled) {
    return <Notice>O programa de fidelidade está temporariamente desativado.</Notice>;
  }

  const rewards = state.rewards.filter((r) => r.active).sort((a, b) => a.costPoints - b.costPoints);
  const levels = [...state.levels].sort((a, b) => a.minPoints - b.minPoints);

  async function redeem() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.redeemReward(customer.id, target.id);
      track("loyalty_reward_redeemed", { reward: target.name, points: target.costPoints });
      setCode(r.code);
      toast("Recompensa resgatada!");
    } catch (e) {
      setError(e instanceof DomainError ? e.message : "Não foi possível resgatar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setTarget(null);
    setCode(null);
    setError(null);
  }

  return (
    <div className="space-y-10">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3" aria-label="Seu saldo">
        <StatCard label="Saldo de pontos" value={num(loyalty.balance)} />
        <StatCard label="Nível atual" value={loyalty.level?.name ?? "—"} hint={loyalty.level?.benefits || undefined} />
        <StatCard label="Visitas concluídas" value={loyalty.completedVisits} />
      </section>

      <section className="rounded-md border border-edge bg-panel p-5" aria-label="Progresso">
        {loyalty.next ? (
          <>
            <p className="text-soft">
              <strong className="tabular-nums text-fg">{num(loyalty.lifetime)}</strong> de{" "}
              <strong className="tabular-nums text-fg">{num(loyalty.next.level.minPoints)}</strong> pontos para o nível{" "}
              <strong className="text-accent-hi">{loyalty.next.level.name}</strong>
            </p>
            <Progress value={loyalty.lifetime} max={loyalty.next.level.minPoints} label="Progresso para o próximo nível" />
          </>
        ) : (
          <p className="text-soft">Você já está no nível mais alto. Obrigado pela fidelidade!</p>
        )}
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Níveis">
          {levels.map((l) => (
            <li key={l.id}>
              <Badge tone={loyalty.level?.id === l.id ? "accent" : "neutral"}>
                {l.name} · {num(l.minPoints)}
              </Badge>
            </li>
          ))}
        </ul>
        {cfg.model !== "points" && cfg.visitsGoal > 0 && (
          <div className="mt-5 border-t border-edge pt-4">
            <p className="text-soft">
              Próximo benefício por visitas: <strong className="text-fg">{loyalty.visitProgress.current}</strong> de{" "}
              <strong className="text-fg">{cfg.visitsGoal}</strong>
            </p>
            <Progress value={loyalty.visitProgress.current} max={cfg.visitsGoal} label="Progresso de visitas" />
          </div>
        )}
      </section>

      <section aria-labelledby="rec">
        <h2 id="rec" className="display text-2xl">Recompensas</h2>
        {rewards.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="Recompensas em breve" description="A barbearia ainda vai divulgar as recompensas disponíveis. Seus pontos já ficam guardados." />
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {rewards.map((r) => {
              const block = redeemBlock(r, loyalty.balance, cfg.enabled);
              return (
                <li key={r.id} className="flex flex-col justify-between gap-4 rounded-md border border-edge bg-panel p-5">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <p className="display text-xl">{r.name}</p>
                      <Badge tone="accent">{num(r.costPoints)} pts</Badge>
                    </div>
                    {r.description && <p className="mt-1 text-sm text-soft">{r.description}</p>}
                    {r.validityDays && <p className="mt-1 text-xs text-soft">Válido por {r.validityDays} dias após o resgate.</p>}
                  </div>
                  <Button
                    size="sm"
                    disabled={block !== null}
                    onClick={() => setTarget(r)}
                    variant={block ? "secondary" : "primary"}
                  >
                    {block === "insufficient_points"
                      ? `Faltam ${num(r.costPoints - loyalty.balance)} pontos`
                      : block === "out_of_stock"
                        ? "Esgotada"
                        : "Resgatar"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="extrato">
        <h2 id="extrato" className="display text-2xl">Extrato</h2>
        {ledger.length === 0 ? (
          <div className="mt-4"><EmptyState title="Sem movimentações ainda" description="Seus pontos aparecem aqui após cada atendimento concluído." /></div>
        ) : (
          <ul className="mt-4 divide-y divide-edge rounded-md border border-edge">
            {ledger.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p>{t.description}</p>
                  <p className="text-xs text-soft">
                    {formatDateBR(toLocalParts(t.createdAt).date)} · {TYPE_LABEL[t.type]}
                    {t.expiresAt && t.amount > 0 && ` · vence em ${formatDateBR(toLocalParts(t.expiresAt).date)}`}
                  </p>
                </div>
                <p className={`display shrink-0 text-xl tabular-nums ${t.amount > 0 ? "text-good" : "text-bad"}`}>
                  {t.amount > 0 ? "+" : ""}{num(t.amount)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={target !== null}
        onClose={close}
        title={code ? "Recompensa resgatada!" : "Resgatar recompensa?"}
        description={target?.name}
        size="sm"
        footer={
          code ? (
            <Button onClick={close}>Fechar</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close} disabled={busy}>Voltar</Button>
              <Button onClick={redeem} loading={busy}>Resgatar por {target ? num(target.costPoints) : 0} pts</Button>
            </>
          )
        }
      >
        {code ? (
          <div className="text-center">
            <p className="text-soft">Mostre este código na barbearia:</p>
            <p className="display my-4 rounded border border-accent/50 bg-bg py-4 font-mono text-3xl tracking-widest text-accent-hi">{code}</p>
            <p className="text-xs text-soft">Você também encontra o código em “Benefícios”.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-soft">
              Serão descontados <strong className="text-fg">{target ? num(target.costPoints) : 0} pontos</strong> do seu saldo de{" "}
              <strong className="text-fg">{num(loyalty.balance)}</strong>.
            </p>
            {error && <Notice tone="bad">{error}</Notice>}
          </div>
        )}
      </Modal>
    </div>
  );
}
