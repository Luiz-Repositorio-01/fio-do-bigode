"use client";

import { useMemo, useState } from "react";
import { AnchorButton, Button } from "@/components/ui/button";
import { IconPlus } from "@/components/ui/icons";
import { SelectField, TextArea, TextField, Toggle } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Badge, EmptyState, Notice } from "@/components/ui/misc";
import { SEGMENT_LABELS } from "@/domain/customers";
import { appointmentMessage, customerMessage } from "@/domain/messages";
import { useNow } from "@/hooks/use-now";
import { addDays, formatDateBR, formatDateLong, fromLocal, minutesToHHmm, todayLocal, toLocalParts } from "@/domain/time";
import { DEFAULT_TEMPLATES, formatPhoneBR } from "@/domain/whatsapp";
import { api } from "@/lib/api";
import { useAppState } from "@/lib/store/store";
import { deleteCampaign, markCampaignSent, upsertCampaign } from "@/services/admin";
import { newId } from "@/utils/ids";
import type { Campaign, CampaignKind, CustomerSegmentKey } from "@/types";
import { Card, PageTitle, Segmented } from "./ui";
import { rowsInSegment, useCustomerRows } from "./use-crm";
import { useRun } from "./use-run";

const KIND_LABEL: Record<CampaignKind, string> = {
  points_multiplier: "Pontos em dobro (multiplicador)",
  bonus_points: "Pontos bônus por atendimento",
  message: "Mensagem para um grupo de clientes",
};
const SEGMENTS = Object.keys(SEGMENT_LABELS) as CustomerSegmentKey[];

const endDateOf = (c: Campaign) => toLocalParts(new Date(c.endsAt).getTime() - 60_000).date;

function CampaignDialog(props: { campaign: Campaign | null; open: boolean; onClose: () => void }) {
  // O corpo só existe com o diálogo aberto: cada abertura começa com o formulário limpo.
  return props.open ? <CampaignDialogBody {...props} /> : null;
}

function CampaignDialogBody({ campaign, open, onClose }: { campaign: Campaign | null; open: boolean; onClose: () => void }) {
  const { business } = useAppState();
  const { busy, run } = useRun();
  const [f, setF] = useState(() => {
    const today = todayLocal();
    return {
      name: campaign?.name ?? "",
      kind: (campaign?.kind ?? "message") as CampaignKind,
      start: campaign ? toLocalParts(campaign.startsAt).date : today,
      end: campaign ? endDateOf(campaign) : addDays(today, 7),
      multiplier: String(campaign?.multiplier ?? 2),
      bonus: String(campaign?.bonusPoints ?? 10),
      segment: (campaign?.segment ?? "inactive") as CustomerSegmentKey,
      template: campaign?.messageTemplate || DEFAULT_TEMPLATES.winback,
      active: campaign?.active ?? true,
    };
  });
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (f.name.trim().length < 2) return setError("Informe o nome da campanha.");
    if (f.end < f.start) return setError("A data final precisa ser depois da inicial.");
    const mult = Number(f.multiplier.replace(",", "."));
    const bonus = Math.round(Number(f.bonus));
    if (f.kind === "points_multiplier" && !(mult > 1 && mult <= 10)) return setError("O multiplicador deve ficar entre 1,1 e 10.");
    if (f.kind === "bonus_points" && !(bonus > 0)) return setError("Informe os pontos bônus.");
    const next: Campaign = {
      id: campaign?.id ?? newId("cmp"),
      businessId: campaign?.businessId ?? business.id,
      name: f.name.trim().slice(0, 80),
      kind: f.kind,
      startsAt: fromLocal(f.start, 0),
      endsAt: fromLocal(f.end, 1440),
      multiplier: f.kind === "points_multiplier" ? mult : null,
      bonusPoints: f.kind === "bonus_points" ? bonus : null,
      segment: f.segment,
      messageTemplate: f.kind === "message" ? f.template.trim() : "",
      active: f.active,
      sentToCustomerIds: campaign?.sentToCustomerIds ?? [],
    };
    const r = await run(() => api.admin((s) => upsertCampaign(s, next)), "Campanha salva.");
    if (r.ok) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={campaign ? "Editar campanha" : "Nova campanha"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={save} loading={busy}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <SelectField label="Tipo" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as CampaignKind })}>
          {(Object.keys(KIND_LABEL) as CampaignKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </SelectField>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Início" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
          <TextField label="Último dia" type="date" min={f.start} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
        </div>
        {f.kind === "points_multiplier" && (
          <TextField label="Multiplicador" inputMode="decimal" value={f.multiplier} onChange={(e) => setF({ ...f, multiplier: e.target.value })} hint="2 = pontos em dobro nos atendimentos concluídos no período." />
        )}
        {f.kind === "bonus_points" && (
          <TextField label="Pontos bônus por atendimento" inputMode="numeric" value={f.bonus} onChange={(e) => setF({ ...f, bonus: e.target.value })} />
        )}
        {f.kind === "message" && (
          <>
            <SelectField label="Quem recebe" value={f.segment} onChange={(e) => setF({ ...f, segment: e.target.value as CustomerSegmentKey })}>
              {SEGMENTS.map((k) => <option key={k} value={k}>{SEGMENT_LABELS[k]}</option>)}
            </SelectField>
            <TextArea label="Mensagem" rows={5} maxLength={600} value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })} hint="Variáveis: {NOME} e {PONTOS}." />
          </>
        )}
        <Toggle label="Campanha ativa" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
        {error && <Notice tone="bad">{error}</Notice>}
      </div>
    </Modal>
  );
}

function SendListDialog({ campaign, onClose }: { campaign: Campaign | null; onClose: () => void }) {
  const state = useAppState();
  const rows = useCustomerRows();
  const { busy, run } = useRun();
  const live = state.campaigns.find((c) => c.id === campaign?.id) ?? null;
  const list = useMemo(
    () => (live ? rowsInSegment(rows, live.segment, state.settings.retention.birthdayLookaheadDays) : []),
    [rows, live, state.settings.retention.birthdayLookaheadDays],
  );
  if (!live) return null;
  const sent = live.sentToCustomerIds.length;
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Lista de envio: ${live.name}`}
      description={`${SEGMENT_LABELS[live.segment]} · ${list.length} cliente(s) · ${sent} marcado(s) como enviado`}
    >
      <Notice tone="info">
        Cada botão abre o WhatsApp com a mensagem pronta para aquele cliente. O envio é manual: depois de enviar,
        marque “Enviado” para não repetir.
      </Notice>
      {list.length === 0 ? (
        <div className="mt-4"><EmptyState title="Nenhum cliente neste grupo agora" /></div>
      ) : (
        <ul className="mt-4 divide-y divide-edge">
          {list.map(({ customer }) => {
            const done = live.sentToCustomerIds.includes(customer.id);
            return (
              <li key={customer.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{customer.name}</span>
                  <span className="block text-xs text-soft">{formatPhoneBR(customer.whatsapp)}</span>
                </span>
                <span className="flex gap-1.5">
                  <AnchorButton size="sm" variant="whatsapp" href={customerMessage(state, "winback", customer, live.messageTemplate).url} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </AnchorButton>
                  {done ? (
                    <Badge tone="good">Enviado</Badge>
                  ) : (
                    <Button size="sm" variant="secondary" loading={busy} onClick={() => run(() => api.admin((s) => markCampaignSent(s, live.id, customer.id), true, 100))}>
                      Marcar enviado
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

function Reminders() {
  const state = useAppState();
  const now = useNow(60_000);
  const today = todayLocal(now);
  const tomorrow = addDays(today, 1);
  const list = state.appointments
    .filter((a) => (a.status === "pending" || a.status === "confirmed") && [today, tomorrow].includes(toLocalParts(a.startsAt).date) && new Date(a.startsAt).getTime() > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return (
    <Card title="Lembretes de hoje e amanhã" description="Atendimentos ainda por vir. O envio é manual pelo WhatsApp.">
      <Notice tone="info">
        O sistema não envia mensagens sozinho (isso exige a API oficial do WhatsApp Business, ainda não contratada).
        Aqui você abre a conversa com o lembrete pronto.
      </Notice>
      {list.length === 0 ? (
        <div className="mt-4"><EmptyState title="Nenhum atendimento para lembrar" /></div>
      ) : (
        <ul className="mt-4 divide-y divide-edge">
          {list.map((a) => {
            const c = state.customers.find((x) => x.id === a.customerId);
            const msg = appointmentMessage(state, "reminder", a);
            const l = toLocalParts(a.startsAt);
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="min-w-0">
                  <span className="block font-medium">{c?.name ?? "—"}</span>
                  <span className="block text-sm text-soft">{l.date === today ? "Hoje" : "Amanhã"} ({formatDateLong(l.date)}) às {minutesToHHmm(l.minutes)} · {a.serviceName}</span>
                </span>
                {msg && (
                  <AnchorButton size="sm" variant="whatsapp" href={msg.url} target="_blank" rel="noopener noreferrer">
                    Enviar lembrete
                  </AnchorButton>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function CampaignsAdmin() {
  const { campaigns } = useAppState();
  const { busy, run } = useRun();
  const [tab, setTab] = useState<"campaigns" | "reminders">("campaigns");
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState<Campaign | null>(null);
  const now = useNow(60_000);

  return (
    <>
      <PageTitle
        title="Campanhas"
        description="Promoções de pontos, mensagens por segmento e lembretes de horário."
        actions={tab === "campaigns" ? <Button onClick={() => setCreating(true)}><IconPlus width={16} height={16} /> Nova campanha</Button> : undefined}
      />
      <div className="mb-5">
        <Segmented label="Seção" value={tab} onChange={setTab} options={[{ value: "campaigns", label: "Campanhas" }, { value: "reminders", label: "Lembretes" }]} />
      </div>

      {tab === "reminders" ? (
        <Reminders />
      ) : campaigns.length === 0 ? (
        <EmptyState
          title="Nenhuma campanha criada"
          description="Crie uma promoção de pontos ou uma mensagem para clientes inativos, aniversariantes e outros grupos."
          action={<Button onClick={() => setCreating(true)}>Criar campanha</Button>}
        />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {[...campaigns].sort((a, b) => b.startsAt.localeCompare(a.startsAt)).map((c) => {
            const running = c.active && new Date(c.startsAt).getTime() <= now && now <= new Date(c.endsAt).getTime();
            const ended = new Date(c.endsAt).getTime() < now;
            return (
              <li key={c.id} className="rounded-md border border-edge bg-panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="display text-xl">{c.name}</p>
                    <p className="text-sm text-soft">
                      {formatDateBR(toLocalParts(c.startsAt).date)} a {formatDateBR(endDateOf(c))}
                    </p>
                  </div>
                  <Badge tone={!c.active ? "neutral" : running ? "good" : ended ? "neutral" : "warn"}>
                    {!c.active ? "Desativada" : running ? "Em andamento" : ended ? "Encerrada" : "Agendada"}
                  </Badge>
                </div>
                <p className="mt-3 text-sm">
                  {c.kind === "points_multiplier" && `Pontos x${c.multiplier} nos atendimentos concluídos no período.`}
                  {c.kind === "bonus_points" && `+${c.bonusPoints} pontos por atendimento concluído no período.`}
                  {c.kind === "message" && `${SEGMENT_LABELS[c.segment]} · ${c.sentToCustomerIds.length} marcado(s) como enviado.`}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {c.kind === "message" && <Button size="sm" variant="whatsapp" onClick={() => setSending(c)}>Lista de envio</Button>}
                  <Button size="sm" variant="secondary" onClick={() => setEditing(c)}>Editar</Button>
                  <Button size="sm" variant="ghost" loading={busy} onClick={() => run(() => api.admin((s) => deleteCampaign(s, c.id)), "Campanha excluída.")}>Excluir</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <CampaignDialog campaign={editing} open={creating || editing !== null} onClose={() => { setCreating(false); setEditing(null); }} />
      <SendListDialog campaign={sending} onClose={() => setSending(null)} />
    </>
  );
}
