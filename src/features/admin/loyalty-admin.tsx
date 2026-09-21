"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconPlus } from "@/components/ui/icons";
import { SelectField, TextField, Toggle } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Badge, EmptyState, Notice } from "@/components/ui/misc";
import { balanceOf, levelFor, lifetimePointsOf } from "@/domain/loyalty";
import { api } from "@/lib/api";
import { useAppState } from "@/lib/store/store";
import { fieldErrors, levelFormSchema } from "@/schemas";
import { deleteLevel, updateSettings, upsertLevel } from "@/services/admin";
import { newId } from "@/utils/ids";
import type { BusinessSettings, LoyaltyLevel, LoyaltyModel, RoundingMode } from "@/types";
import { Card, PageTitle, Stat, TableWrap, TD, TH } from "./ui";
import { useRun } from "./use-run";

const toNum = (v: string, fallback = 0) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};

function RulesCard() {
  const { settings } = useAppState();
  // key: se as regras mudarem (salvar, outra aba), o formulário recomeça com os valores vigentes.
  return <RulesForm key={JSON.stringify(settings.loyalty)} />;
}

function RulesForm() {
  const { settings, rewards } = useAppState();
  const { busy, run } = useRun();
  const l = settings.loyalty;
  const [f, setF] = useState({
    enabled: l.enabled,
    model: l.model as LoyaltyModel,
    pointsPerReal: String(l.pointsPerReal),
    pointsPerVisit: String(l.pointsPerVisit),
    rounding: l.rounding as RoundingMode,
    validity: l.pointsValidityDays === null ? "" : String(l.pointsValidityDays),
    visitsGoal: String(l.visitsGoal),
    visitsRewardId: l.visitsRewardId ?? "",
    birthday: String(l.birthdayBonusPoints),
    refEnabled: l.referral.enabled,
    refReferrer: String(l.referral.referrerPoints),
    refReferee: String(l.referral.refereePoints),
    refLimit: String(l.referral.monthlyLimit),
  });
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    const next: BusinessSettings["loyalty"] = {
      enabled: f.enabled,
      model: f.model,
      pointsPerReal: Math.max(0, toNum(f.pointsPerReal)),
      pointsPerVisit: Math.max(0, Math.round(toNum(f.pointsPerVisit))),
      rounding: f.rounding,
      pointsValidityDays: f.validity.trim() ? Math.max(1, Math.round(toNum(f.validity))) : null,
      visitsGoal: Math.max(0, Math.round(toNum(f.visitsGoal))),
      visitsRewardId: f.visitsRewardId || null,
      birthdayBonusPoints: Math.max(0, Math.round(toNum(f.birthday))),
      referral: {
        enabled: f.refEnabled,
        referrerPoints: Math.max(0, Math.round(toNum(f.refReferrer))),
        refereePoints: Math.max(0, Math.round(toNum(f.refReferee))),
        monthlyLimit: Math.max(0, Math.round(toNum(f.refLimit))),
      },
    };
    if ((next.model === "visits" || next.model === "hybrid") && next.visitsGoal > 0 && !next.visitsRewardId) {
      return setError("Escolha a recompensa que o cliente ganha ao bater a meta de visitas.");
    }
    setError(null);
    await run(() => api.admin((s) => updateSettings(s, (cur) => ({ ...cur, loyalty: next }))), "Regras salvas.");
  }

  const usesPoints = f.model !== "visits";
  const usesVisits = f.model !== "points";

  return (
    <Card title="Regras do programa" description="Valores iniciais de exemplo: defina com a barbearia antes de divulgar.">
      <div className="space-y-5">
        <Toggle label="Programa de fidelidade ativo" description="Desligado, ninguém acumula nem resgata." checked={f.enabled} onChange={(v) => set("enabled", v)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Modelo" value={f.model} onChange={(e) => set("model", e.target.value as LoyaltyModel)}>
            <option value="points">Pontos por gasto</option>
            <option value="visits">Cartão de visitas (a cada N visitas)</option>
            <option value="hybrid">Híbrido (pontos + visitas)</option>
          </SelectField>
          <SelectField label="Arredondamento dos pontos" value={f.rounding} onChange={(e) => set("rounding", e.target.value as RoundingMode)} disabled={!usesPoints}>
            <option value="floor">Para baixo</option>
            <option value="round">Ao mais próximo</option>
            <option value="ceil">Para cima</option>
          </SelectField>
          {usesPoints && (
            <>
              <TextField label="Pontos por R$ 1 gasto" inputMode="decimal" value={f.pointsPerReal} onChange={(e) => set("pointsPerReal", e.target.value)} />
              <TextField label="Pontos fixos por visita" inputMode="numeric" value={f.pointsPerVisit} onChange={(e) => set("pointsPerVisit", e.target.value)} />
              <TextField label="Validade dos pontos (dias)" inputMode="numeric" optional value={f.validity} onChange={(e) => set("validity", e.target.value)} hint="Vazio = pontos não expiram." />
            </>
          )}
          {usesVisits && (
            <>
              <TextField label="Meta de visitas" inputMode="numeric" value={f.visitsGoal} onChange={(e) => set("visitsGoal", e.target.value)} hint="A cada N atendimentos concluídos, o cliente ganha a recompensa." />
              <SelectField label="Recompensa da meta" value={f.visitsRewardId} onChange={(e) => set("visitsRewardId", e.target.value)}>
                <option value="">Escolha…</option>
                {rewards.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </SelectField>
            </>
          )}
          <TextField label="Bônus de aniversário (pontos)" inputMode="numeric" value={f.birthday} onChange={(e) => set("birthday", e.target.value)} hint="Concedido uma vez por ano pela rotina de fidelidade. 0 = desligado." />
        </div>

        <div className="border-t border-edge pt-5">
          <Toggle label="Programa de indicação" description="A indicação só vale quando o indicado conclui o primeiro atendimento." checked={f.refEnabled} onChange={(v) => set("refEnabled", v)} />
          {f.refEnabled && (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <TextField label="Pontos para quem indicou" inputMode="numeric" value={f.refReferrer} onChange={(e) => set("refReferrer", e.target.value)} />
              <TextField label="Pontos para o indicado" inputMode="numeric" value={f.refReferee} onChange={(e) => set("refReferee", e.target.value)} />
              <TextField label="Limite por mês (por cliente)" inputMode="numeric" value={f.refLimit} onChange={(e) => set("refLimit", e.target.value)} />
            </div>
          )}
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
        <Button onClick={save} loading={busy}>Salvar regras</Button>
      </div>
    </Card>
  );
}

function LevelDialog(props: { level: LoyaltyLevel | null; open: boolean; onClose: () => void }) {
  return props.open ? <LevelDialogBody {...props} /> : null;
}

function LevelDialogBody({ level, open, onClose }: { level: LoyaltyLevel | null; open: boolean; onClose: () => void }) {
  const { business } = useAppState();
  const { busy, run } = useRun();
  const [f, setF] = useState(() => ({
    name: level?.name ?? "",
    min: String(level?.minPoints ?? 0),
    discount: level?.discountPercent == null ? "" : String(level.discountPercent),
    benefits: level?.benefits ?? "",
    vip: level?.isVip ?? false,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save() {
    const parsed = levelFormSchema.safeParse({
      name: f.name,
      minPoints: Math.round(toNum(f.min)),
      discountPercent: f.discount.trim() ? toNum(f.discount) : null,
      benefits: f.benefits,
      isVip: f.vip,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    const p = parsed.data;
    const next: LoyaltyLevel = {
      id: level?.id ?? newId("lvl"),
      businessId: level?.businessId ?? business.id,
      name: p.name,
      minPoints: p.minPoints,
      discountPercent: p.discountPercent,
      benefits: p.benefits,
      isVip: p.isVip,
    };
    const r = await run(() => api.admin((s) => upsertLevel(s, next)), "Nível salvo.");
    if (r.ok) onClose();
    else setErrors({ minPoints: r.error });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={level ? "Editar nível" : "Novo nível"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={save} loading={busy}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Nome" value={f.name} error={errors.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <TextField label="Pontos acumulados para chegar" inputMode="numeric" value={f.min} error={errors.minPoints} onChange={(e) => setF({ ...f, min: e.target.value })} hint="Conta o total já acumulado: resgatar recompensas não rebaixa o cliente." />
        <TextField label="Desconto do nível (%)" inputMode="decimal" optional value={f.discount} error={errors.discountPercent} onChange={(e) => setF({ ...f, discount: e.target.value })} hint="Só informativo até a barbearia definir a regra." />
        <TextField label="Benefícios" optional value={f.benefits} error={errors.benefits} onChange={(e) => setF({ ...f, benefits: e.target.value })} />
        <Toggle label="Nível VIP" description="Entra no segmento “Clientes VIP”." checked={f.vip} onChange={(v) => setF({ ...f, vip: v })} />
      </div>
    </Modal>
  );
}

export function LoyaltyAdmin() {
  const state = useAppState();
  const { busy, run } = useRun();
  const [editing, setEditing] = useState<LoyaltyLevel | null>(null);
  const [creating, setCreating] = useState(false);
  const levels = useMemo(() => [...state.levels].sort((a, b) => a.minPoints - b.minPoints), [state.levels]);

  const stats = useMemo(() => {
    const perLevel = new Map<string, number>();
    let circulating = 0;
    for (const c of state.customers) {
      circulating += balanceOf(state.ledger, c.id);
      const lv = levelFor(lifetimePointsOf(state.ledger, c.id), state.levels);
      if (lv) perLevel.set(lv.id, (perLevel.get(lv.id) ?? 0) + 1);
    }
    return { circulating, perLevel };
  }, [state]);

  return (
    <>
      <PageTitle title="Fidelidade" description="Regras de pontos, níveis e indicação. Tudo é editável — nada aqui é definitivo." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Pontos em circulação" value={stats.circulating} hint="soma dos saldos" />
        <Stat label="Clientes no programa" value={state.customers.length} />
        <Stat label="Status" value={state.settings.loyalty.enabled ? "Ativo" : "Desligado"} />
      </div>
      <div className="space-y-6">
        <RulesCard />
        <Card
          title="Níveis"
          description="O nível vem do total de pontos já acumulados."
          actions={<Button size="sm" onClick={() => setCreating(true)}><IconPlus width={14} height={14} /> Novo nível</Button>}
          flush
        >
          {levels.length === 0 ? (
            <div className="p-5"><EmptyState title="Nenhum nível" /></div>
          ) : (
            <TableWrap>
              <thead><tr><TH>Nível</TH><TH className="text-right">A partir de</TH><TH>Benefícios</TH><TH className="text-right">Clientes</TH><TH className="text-right">Ações</TH></tr></thead>
              <tbody>
                {levels.map((lv) => (
                  <tr key={lv.id}>
                    <TD><span className="font-medium">{lv.name}</span> {lv.isVip && <Badge tone="accent">VIP</Badge>}</TD>
                    <TD className="text-right tabular-nums">{lv.minPoints} pts</TD>
                    <TD className="text-soft">
                      {[lv.discountPercent ? `${lv.discountPercent}% de desconto` : null, lv.benefits || null].filter(Boolean).join(" · ") || "—"}
                    </TD>
                    <TD className="text-right tabular-nums">{stats.perLevel.get(lv.id) ?? 0}</TD>
                    <TD className="whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(lv)}>Editar</Button>
                      <Button size="sm" variant="ghost" loading={busy} onClick={() => run(() => api.admin((s) => deleteLevel(s, lv.id)), "Nível removido.")}>Excluir</Button>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
      <LevelDialog level={editing} open={creating || editing !== null} onClose={() => { setCreating(false); setEditing(null); }} />
    </>
  );
}
