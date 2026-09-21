"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AnchorButton, Button } from "@/components/ui/button";
import { SelectField, TextArea, TextField } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Badge, EmptyState, Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { customerMessage } from "@/domain/messages";
import { formatBRL, formatPrice } from "@/domain/pricing";
import { formatDateBR, formatDateTimeBR, minutesToHHmm, toLocalParts } from "@/domain/time";
import { formatPhoneBR, waLink, type MessageTemplateKey } from "@/domain/whatsapp";
import { StatusBadge } from "@/features/booking/status";
import { api } from "@/lib/api";
import { useAppState, useHydrated } from "@/lib/store/store";
import { addCustomerNote, cancelCustomerReward, deleteCustomer, deleteCustomerNote, grantReward } from "@/services/admin";
import { loyaltySummary } from "@/services/loyalty";
import { AppointmentDialog } from "./appointment-dialog";
import { CustomerFormDialog } from "./customer-form-dialog";
import { NewBookingDialog } from "./new-booking-dialog";
import { Card, PageTitle, Stat, TableWrap, TD, TH } from "./ui";
import { useCustomerRows } from "./use-crm";
import { useRun } from "./use-run";

const MESSAGES: Array<{ key: MessageTemplateKey; label: string }> = [
  { key: "winback", label: "Recuperar cliente" },
  { key: "birthday", label: "Parabéns" },
  { key: "loyalty", label: "Saldo de pontos" },
];

export function ClientProfile({ id }: { id: string }) {
  const state = useAppState();
  const hydrated = useHydrated();
  const router = useRouter();
  const toast = useToast();
  const { busy, run } = useRun();
  const rows = useCustomerRows();
  const row = rows.find((r) => r.customer.id === id);

  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [booking, setBooking] = useState(false);
  const [note, setNote] = useState("");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjError, setAdjError] = useState<string | undefined>();
  const [rewardId, setRewardId] = useState("");
  const [deleting, setDeleting] = useState(false);

  const appointments = useMemo(
    () => state.appointments.filter((a) => a.customerId === id).sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    [state.appointments, id],
  );
  const ledger = useMemo(
    () => state.ledger.filter((t) => t.customerId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.ledger, id],
  );
  const notes = useMemo(
    () => state.customerNotes.filter((n) => n.customerId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.customerNotes, id],
  );
  const wallet = state.customerRewards.filter((r) => r.customerId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (!hydrated) return null;
  if (!row) {
    return (
      <>
        <PageTitle title="Cliente não encontrado" />
        <EmptyState
          title="Este cliente não existe (ou foi excluído)"
          action={<Link href="/admin/clientes" className="text-accent-hi underline underline-offset-4">Voltar para a lista</Link>}
        />
      </>
    );
  }

  const { customer, metrics, segments } = row;
  const summary = loyaltySummary(state, id);
  const pro = state.professionals.find((p) => p.id === metrics.preferredProfessionalId);
  const referrer = state.customers.find((c) => c.id === customer.referredByCustomerId);
  const referred = state.referrals
    .filter((r) => r.referrerId === id)
    .map((r) => ({ r, c: state.customers.find((c) => c.id === r.refereeId) }));
  const activeRewards = state.rewards.filter((r) => r.active);

  async function submitAdjust() {
    const amount = Number(adjAmount.replace(",", "."));
    if (!Number.isInteger(amount) || amount === 0) return setAdjError("Informe um número inteiro de pontos (use - para remover).");
    if (!adjReason.trim()) return setAdjError("Informe o motivo do ajuste.");
    setAdjError(undefined);
    const r = await run(() => api.adjustPoints(id, amount, adjReason), "Pontos ajustados.");
    if (r.ok) {
      setAdjAmount("");
      setAdjReason("");
    } else setAdjError(r.error);
  }

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/clientes" className="text-accent-hi underline underline-offset-4">← Clientes</Link>
      </p>
      <PageTitle
        title={customer.name}
        description={`${formatPhoneBR(customer.whatsapp)}${customer.email ? ` · ${customer.email}` : ""}`}
        actions={
          <>
            <AnchorButton variant="whatsapp" size="sm" href={waLink(customer.whatsapp)} target="_blank" rel="noopener noreferrer">
              Abrir conversa
            </AnchorButton>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Editar</Button>
            <Button size="sm" onClick={() => setBooking(true)}>Novo agendamento</Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {segments.isNew && <Badge tone="accent">Novo</Badge>}
        {segments.isVip && <Badge tone="accent">VIP</Badge>}
        {segments.isRecurring && <Badge tone="good">Recorrente</Badge>}
        {segments.isInactive && <Badge tone="warn">Inativo {segments.inactiveBucket}+ dias</Badge>}
        {segments.birthdayInDays !== null && segments.birthdayInDays <= state.settings.retention.birthdayLookaheadDays && (
          <Badge tone="neutral">Aniversário {segments.birthdayInDays === 0 ? "hoje" : `em ${segments.birthdayInDays} d`}</Badge>
        )}
        {customer.isDemo && <Badge tone="neutral">Dado de demonstração</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Visitas" value={metrics.visits} hint={metrics.lastVisitAt ? `última em ${formatDateBR(toLocalParts(metrics.lastVisitAt).date)}` : "sem visita concluída"} />
        <Stat label="Total gasto" value={formatBRL(metrics.totalSpentCents)} hint={metrics.visits ? `ticket médio ${formatBRL(metrics.avgTicketCents)}` : undefined} />
        <Stat label="Pontos" value={summary.balance} hint={summary.level ? `Nível ${summary.level.name}` : "sem nível"} />
        <Stat label="Faltas / cancelamentos" value={`${metrics.noShows} / ${metrics.cancellations}`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card title="Histórico de agendamentos" flush>
            {appointments.length === 0 ? (
              <div className="p-5"><EmptyState title="Sem agendamentos" /></div>
            ) : (
              <TableWrap>
                <thead>
                  <tr><TH>Data</TH><TH>Serviço</TH><TH>Profissional</TH><TH className="text-right">Valor</TH><TH>Status</TH></tr>
                </thead>
                <tbody>
                  {appointments.map((a) => {
                    const l = toLocalParts(a.startsAt);
                    return (
                      <tr key={a.id}>
                        <TD className="whitespace-nowrap tabular-nums">
                          <button type="button" onClick={() => setOpenId(a.id)} className="text-accent-hi underline underline-offset-4">
                            {formatDateBR(l.date)} {minutesToHHmm(l.minutes)}
                          </button>
                        </TD>
                        <TD>{a.serviceName}</TD>
                        <TD>{state.professionals.find((p) => p.id === a.professionalId)?.name ?? "—"}</TD>
                        <TD className="text-right tabular-nums">
                          {a.status === "completed" ? formatPrice(a.finalPriceCents, false) : formatPrice(a.priceCents, a.priceIsStartingAt)}
                        </TD>
                        <TD><StatusBadge status={a.status} /></TD>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            )}
          </Card>

          <Card title="Extrato de pontos" description="Lançamentos imutáveis: correções entram como novo ajuste.">
            <div className="mb-5 grid gap-3 rounded-md border border-edge bg-panel-2 p-4 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
              <TextField label="Pontos (+/−)" inputMode="numeric" placeholder="50 ou -20" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} />
              <TextField label="Motivo do ajuste" maxLength={100} value={adjReason} onChange={(e) => setAdjReason(e.target.value)} />
              <Button onClick={submitAdjust} loading={busy}>Ajustar</Button>
              {adjError && <p role="alert" className="text-sm text-bad sm:col-span-3">{adjError}</p>}
            </div>
            {ledger.length === 0 ? (
              <p className="text-sm text-soft">Nenhum lançamento.</p>
            ) : (
              <ul className="divide-y divide-edge text-sm">
                {ledger.map((t) => (
                  <li key={t.id} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate">{t.description}</span>
                      <span className="block text-xs text-soft">{formatDateTimeBR(t.createdAt)}</span>
                    </span>
                    <span className={`shrink-0 font-semibold tabular-nums ${t.amount > 0 ? "text-good" : "text-bad"}`}>
                      {t.amount > 0 ? "+" : ""}{t.amount}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Perfil">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-soft">Cadastro</dt><dd>{formatDateBR(toLocalParts(customer.createdAt).date)}</dd>
              <dt className="text-soft">Nascimento</dt><dd>{customer.birthDate ? formatDateBR(customer.birthDate) : "—"}</dd>
              <dt className="text-soft">Profissional</dt><dd>{pro?.name ?? "—"}</dd>
              <dt className="text-soft">Serviço favorito</dt><dd>{metrics.topServiceName ?? "—"}</dd>
              <dt className="text-soft">Próximo horário</dt>
              <dd>{metrics.nextAppointment ? formatDateTimeBR(metrics.nextAppointment.startsAt) : "—"}</dd>
              <dt className="text-soft">Código indicação</dt><dd className="font-mono">{customer.referralCode}</dd>
              <dt className="text-soft">Indicado por</dt>
              <dd>{referrer ? <Link className="text-accent-hi underline underline-offset-4" href={`/admin/clientes/${referrer.id}`}>{referrer.name}</Link> : "—"}</dd>
            </dl>
            {referred.length > 0 && (
              <div className="mt-4 border-t border-edge pt-3">
                <p className="label-caps mb-1.5 text-xs text-soft">Indicou</p>
                <ul className="space-y-1 text-sm">
                  {referred.map(({ r, c }) => (
                    <li key={r.id} className="flex justify-between gap-2">
                      <span>{c?.name ?? "—"}</span>
                      <span className="text-soft">{r.status === "qualified" ? "qualificada" : r.status === "rejected" ? "recusada" : "aguardando 1ª visita"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card title="Observações internas" description="Visíveis só para a equipe. Nunca aparecem para o cliente.">
            <div className="space-y-2">
              <TextArea label="Nova observação" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: prefere máquina 2, alérgico a…" />
              <Button
                size="sm"
                disabled={!note.trim()}
                loading={busy}
                onClick={async () => {
                  const r = await run(() => api.admin((s, n) => addCustomerNote(s, id, note, n)), "Observação salva.");
                  if (r.ok) setNote("");
                }}
              >
                Salvar observação
              </Button>
            </div>
            {notes.length > 0 && (
              <ul className="mt-4 space-y-3">
                {notes.map((n) => (
                  <li key={n.id} className="rounded border border-edge bg-panel-2 p-3 text-sm">
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-soft">
                      <span>{formatDateTimeBR(n.createdAt)}</span>
                      <button type="button" className="text-bad underline underline-offset-4" onClick={() => run(() => api.admin((s) => deleteCustomerNote(s, n.id)), "Observação removida.")}>
                        Remover
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Benefícios do cliente">
            {wallet.length === 0 ? (
              <p className="text-sm text-soft">Nenhum benefício resgatado.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {wallet.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-2 rounded border border-edge p-2.5">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{w.rewardName}</span>
                      <span className="block font-mono text-xs text-soft">{w.code}</span>
                    </span>
                    {w.status === "available" ? (
                      <span className="flex shrink-0 gap-1.5">
                        <Button size="sm" variant="secondary" loading={busy} onClick={() => run(() => api.useReward(w.id), "Benefício marcado como usado.")}>Usar</Button>
                        <Button size="sm" variant="ghost" onClick={() => run(() => api.admin((s) => cancelCustomerReward(s, w.id)), "Benefício cancelado.")}>Cancelar</Button>
                      </span>
                    ) : (
                      <Badge tone={w.status === "used" ? "accent" : "neutral"}>{w.status === "used" ? "Usado" : w.status === "expired" ? "Expirado" : "Cancelado"}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {activeRewards.length > 0 && (
              <div className="mt-4 grid gap-2 border-t border-edge pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <SelectField label="Conceder cortesia (sem custo de pontos)" value={rewardId} onChange={(e) => setRewardId(e.target.value)}>
                  <option value="">Escolha…</option>
                  {activeRewards.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </SelectField>
                <Button
                  size="sm"
                  disabled={!rewardId}
                  loading={busy}
                  onClick={async () => {
                    const r = await run(() => api.admin((s, n) => grantReward(s, id, rewardId, n)), "Benefício concedido.");
                    if (r.ok) setRewardId("");
                  }}
                >
                  Conceder
                </Button>
              </div>
            )}
          </Card>

          <Card title="Mensagens" description="Abre o WhatsApp com o texto pronto. O envio é manual.">
            <div className="flex flex-wrap gap-2">
              {MESSAGES.map((m) => (
                <AnchorButton key={m.key} size="sm" variant="whatsapp" href={customerMessage(state, m.key, customer).url} target="_blank" rel="noopener noreferrer">
                  {m.label}
                </AnchorButton>
              ))}
            </div>
          </Card>

          <Card title="Privacidade (LGPD)">
            <p className="text-sm text-soft">
              Se o cliente pedir a exclusão dos dados, remova o cadastro e todo o histórico ligado a ele.
            </p>
            <Button className="mt-3" size="sm" variant="danger" onClick={() => setDeleting(true)}>Excluir cliente e histórico</Button>
          </Card>
        </div>
      </div>

      <AppointmentDialog appointmentId={openId} onClose={() => setOpenId(null)} />
      <CustomerFormDialog open={editing} customer={customer} onClose={() => setEditing(false)} />
      <NewBookingDialog open={booking} onClose={() => setBooking(false)} defaultCustomerId={id} />
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Excluir cliente?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(false)}>Manter</Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                const r = await run(() => api.admin((s) => deleteCustomer(s, id)));
                if (r.ok) {
                  toast("Cliente e histórico excluídos.");
                  router.push("/admin/clientes");
                }
              }}
            >
              Excluir definitivamente
            </Button>
          </>
        }
      >
        <Notice tone="bad" title="Esta ação não pode ser desfeita">
          Serão apagados {customer.name}, {appointments.length} agendamento(s), {ledger.length} lançamento(s) de pontos e
          as observações internas.
        </Notice>
      </Modal>
    </>
  );
}
