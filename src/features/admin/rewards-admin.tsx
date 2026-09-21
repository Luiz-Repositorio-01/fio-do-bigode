"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconPlus } from "@/components/ui/icons";
import { SelectField, TextArea, TextField, Toggle } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Badge, EmptyState } from "@/components/ui/misc";
import { formatDateTimeBR } from "@/domain/time";
import { useNow } from "@/hooks/use-now";
import { api } from "@/lib/api";
import { useAppState } from "@/lib/store/store";
import { fieldErrors, rewardFormSchema } from "@/schemas";
import { cancelCustomerReward, deleteReward, upsertReward } from "@/services/admin";
import { newId } from "@/utils/ids";
import type { CustomerRewardStatus, LoyaltyReward, RewardKind } from "@/types";
import { Card, PageTitle, TableWrap, TD, TH } from "./ui";
import { useRun } from "./use-run";

const KIND_LABEL: Record<RewardKind, string> = {
  discount: "Desconto",
  free_service: "Serviço grátis",
  upgrade: "Upgrade",
  other: "Outro",
};
const STATUS: Record<CustomerRewardStatus, { label: string; tone: "good" | "accent" | "neutral" | "bad" }> = {
  available: { label: "Disponível", tone: "good" },
  used: { label: "Usado", tone: "accent" },
  expired: { label: "Expirado", tone: "neutral" },
  cancelled: { label: "Cancelado", tone: "bad" },
};

function RewardDialog(props: { reward: LoyaltyReward | null; open: boolean; onClose: () => void }) {
  return props.open ? <RewardDialogBody {...props} /> : null;
}

function RewardDialogBody({ reward, open, onClose }: { reward: LoyaltyReward | null; open: boolean; onClose: () => void }) {
  const { business } = useAppState();
  const { busy, run } = useRun();
  const [f, setF] = useState(() => ({
    name: reward?.name ?? "",
    description: reward?.description ?? "",
    kind: (reward?.kind ?? "free_service") as RewardKind,
    cost: String(reward?.costPoints ?? 100),
    validity: reward?.validityDays == null ? "" : String(reward.validityDays),
    stock: reward?.stock == null ? "" : String(reward.stock),
    active: reward?.active ?? true,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save() {
    const parsed = rewardFormSchema.safeParse({
      name: f.name,
      description: f.description,
      kind: f.kind,
      costPoints: Math.round(Number(f.cost)),
      validityDays: f.validity.trim() ? Math.round(Number(f.validity)) : null,
      stock: f.stock.trim() ? Math.round(Number(f.stock)) : null,
      active: f.active,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    const p = parsed.data;
    const next: LoyaltyReward = {
      id: reward?.id ?? newId("rw"),
      businessId: reward?.businessId ?? business.id,
      name: p.name,
      description: p.description,
      kind: p.kind,
      costPoints: p.costPoints,
      validityDays: p.validityDays,
      stock: p.stock,
      active: p.active,
      isDemo: reward?.isDemo ?? false,
    };
    const r = await run(() => api.admin((s) => upsertReward(s, next)), "Recompensa salva.");
    if (r.ok) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={reward ? "Editar recompensa" : "Nova recompensa"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={save} loading={busy}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Nome" value={f.name} error={errors.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <TextArea label="Descrição / regras de uso" optional maxLength={300} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Tipo" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as RewardKind })}>
            {(Object.keys(KIND_LABEL) as RewardKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </SelectField>
          <TextField label="Custo (pontos)" inputMode="numeric" value={f.cost} error={errors.costPoints} onChange={(e) => setF({ ...f, cost: e.target.value })} />
          <TextField label="Validade após resgate (dias)" inputMode="numeric" optional value={f.validity} error={errors.validityDays} onChange={(e) => setF({ ...f, validity: e.target.value })} />
          <TextField label="Estoque" inputMode="numeric" optional value={f.stock} error={errors.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} hint="Vazio = ilimitado." />
        </div>
        <Toggle label="Disponível para resgate" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
      </div>
    </Modal>
  );
}

export function RewardsAdmin() {
  const state = useAppState();
  const { busy, run } = useRun();
  const [editing, setEditing] = useState<LoyaltyReward | null>(null);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<CustomerRewardStatus | "all">("all");

  const redemptions = useMemo(
    () =>
      state.customerRewards
        .filter((r) => status === "all" || r.status === status)
        .filter((r) => !code.trim() || r.code.includes(code.trim().toUpperCase()))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.customerRewards, status, code],
  );
  const now = useNow(60_000);

  return (
    <>
      <PageTitle
        title="Recompensas"
        description="Catálogo do que o cliente pode resgatar e controle dos benefícios já emitidos."
        actions={<Button onClick={() => setCreating(true)}><IconPlus width={16} height={16} /> Nova recompensa</Button>}
      />

      <Card title="Catálogo" flush>
        {state.rewards.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nenhuma recompensa cadastrada" description="Crie as recompensas que a barbearia decidir oferecer. Nenhum benefício é inventado pelo sistema." />
          </div>
        ) : (
          <TableWrap>
            <thead><tr><TH>Recompensa</TH><TH>Tipo</TH><TH className="text-right">Custo</TH><TH className="text-right">Estoque</TH><TH>Status</TH><TH className="text-right">Ações</TH></tr></thead>
            <tbody>
              {state.rewards.map((r) => (
                <tr key={r.id}>
                  <TD>
                    <span className="font-medium">{r.name}</span>
                    {r.isDemo && <> <Badge tone="neutral">demo</Badge></>}
                    {r.description && <span className="block text-xs text-soft">{r.description}</span>}
                  </TD>
                  <TD>{KIND_LABEL[r.kind]}</TD>
                  <TD className="text-right tabular-nums">{r.costPoints} pts</TD>
                  <TD className="text-right tabular-nums">{r.stock ?? "∞"}</TD>
                  <TD><Badge tone={r.active ? "good" : "neutral"}>{r.active ? "Ativa" : "Inativa"}</Badge></TD>
                  <TD className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Editar</Button>
                    <Button size="sm" variant="ghost" loading={busy} onClick={() => run(() => api.admin((s) => deleteReward(s, r.id)), "Recompensa excluída.")}>Excluir</Button>
                  </TD>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card
        className="mt-6"
        title="Benefícios emitidos"
        description="Confira o código apresentado pelo cliente e marque como usado no atendimento."
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <TextField label="Buscar código" placeholder="FDB-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} />
          <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value as CustomerRewardStatus | "all")}>
            <option value="all">Todos</option>
            {(Object.keys(STATUS) as CustomerRewardStatus[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
          </SelectField>
        </div>
        {redemptions.length === 0 ? (
          <p className="text-sm text-soft">Nenhum benefício encontrado.</p>
        ) : (
          <ul className="divide-y divide-edge">
            {redemptions.map((r) => {
              const c = state.customers.find((x) => x.id === r.customerId);
              const overdue = r.status === "available" && r.expiresAt !== null && new Date(r.expiresAt).getTime() <= now;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{r.rewardName} <span className="font-mono text-xs text-soft">{r.code}</span></p>
                    <p className="text-sm text-soft">
                      {c ? <Link className="text-accent-hi underline underline-offset-4" href={`/admin/clientes/${c.id}`}>{c.name}</Link> : "Cliente removido"} · emitido em {formatDateTimeBR(r.createdAt)}
                      {r.expiresAt && ` · válido até ${formatDateTimeBR(r.expiresAt)}`}
                    </p>
                  </div>
                  {r.status === "available" && !overdue ? (
                    <div className="flex gap-1.5">
                      <Button size="sm" loading={busy} onClick={() => run(() => api.useReward(r.id), "Benefício marcado como usado.")}>Marcar como usado</Button>
                      <Button size="sm" variant="ghost" onClick={() => run(() => api.admin((s) => cancelCustomerReward(s, r.id)), "Benefício cancelado.")}>Cancelar</Button>
                    </div>
                  ) : (
                    <Badge tone={overdue ? "warn" : STATUS[r.status].tone}>{overdue ? "Vencido (rodar rotina)" : STATUS[r.status].label}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <RewardDialog reward={editing} open={creating || editing !== null} onClose={() => { setCreating(false); setEditing(null); }} />
    </>
  );
}
