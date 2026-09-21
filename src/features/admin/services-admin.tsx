"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconPlus } from "@/components/ui/icons";
import { TextArea, TextField, Toggle } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Badge, EmptyState, Notice } from "@/components/ui/misc";
import { centsToInput, formatDuration, formatPrice, parseReaisToCents } from "@/domain/pricing";
import { weekdayShort } from "@/domain/time";
import { api } from "@/lib/api";
import { useAppState } from "@/lib/store/store";
import { serviceFormSchema, fieldErrors } from "@/schemas";
import { deleteService, upsertService } from "@/services/admin";
import { newId } from "@/utils/ids";
import type { PriceRule, Service, Weekday } from "@/types";
import { Card, PageTitle, TableWrap, TD, TH } from "./ui";
import { useRun } from "./use-run";

interface RuleDraft { weekdays: Weekday[]; price: string; label: string }

function ServiceDialog(props: { service: Service | null; open: boolean; onClose: () => void }) {
  return props.open ? <ServiceDialogBody {...props} /> : null;
}

function ServiceDialogBody({ service, open, onClose }: { service: Service | null; open: boolean; onClose: () => void }) {
  const { services, business } = useAppState();
  const { busy, run } = useRun();
  const [form, setForm] = useState(() => ({
    name: service?.name ?? "",
    description: service?.description ?? "",
    price: centsToInput(service?.priceCents),
    startingAt: service?.priceIsStartingAt ?? false,
    duration: String(service?.durationMinutes ?? 30),
    confirmed: service?.durationConfirmed ?? true,
    bonus: String(service?.pointsBonus ?? 0),
    active: service?.active ?? true,
  }));
  const [rules, setRules] = useState<RuleDraft[]>(() =>
    (service?.priceRules ?? []).map((r) => ({ weekdays: r.weekdays, price: centsToInput(r.priceCents), label: r.label })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    const priceCents = form.price.trim() ? parseReaisToCents(form.price) : null;
    if (form.price.trim() && priceCents === null) return setErrors({ price: "Valor inválido." });
    const parsed = serviceFormSchema.safeParse({
      name: form.name,
      description: form.description,
      priceReais: priceCents === null ? null : priceCents / 100,
      priceIsStartingAt: form.startingAt,
      durationMinutes: Number(form.duration),
      pointsBonus: Number(form.bonus || 0),
      active: form.active,
    });
    if (!parsed.success) {
      const e = fieldErrors(parsed.error);
      return setErrors({ ...e, price: e.priceReais ?? "", duration: e.durationMinutes ?? "" });
    }
    const priceRules: PriceRule[] = [];
    for (const r of rules) {
      const cents = parseReaisToCents(r.price);
      if (cents === null || r.weekdays.length === 0) return setErrors({ rules: "Cada regra precisa de dias da semana e um valor válido." });
      priceRules.push({ weekdays: r.weekdays, priceCents: cents, label: r.label.trim() || "Preço especial" });
    }
    const p = parsed.data;
    const next: Service = {
      id: service?.id ?? newId("svc"),
      businessId: service?.businessId ?? business.id,
      name: p.name,
      description: p.description,
      priceCents,
      priceIsStartingAt: p.priceIsStartingAt,
      priceRules,
      durationMinutes: p.durationMinutes,
      durationConfirmed: form.confirmed,
      pointsBonus: p.pointsBonus,
      active: p.active,
      sortOrder: service?.sortOrder ?? Math.max(0, ...services.map((s) => s.sortOrder)) + 1,
    };
    const r = await run(() => api.admin((s) => upsertService(s, next)), "Serviço salvo.");
    if (r.ok) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={service ? "Editar serviço" : "Novo serviço"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={save} loading={busy}>Salvar</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nome" value={form.name} error={errors.name} onChange={(e) => set("name", e.target.value)} wrapperClassName="sm:col-span-2" />
        <TextArea label="Descrição" optional maxLength={300} value={form.description} onChange={(e) => set("description", e.target.value)} wrapperClassName="sm:col-span-2" />
        <TextField label="Preço (R$)" inputMode="decimal" value={form.price} error={errors.price} onChange={(e) => set("price", e.target.value)} hint="Deixe vazio para exibir “Consultar”." />
        <TextField label="Duração (minutos)" inputMode="numeric" value={form.duration} error={errors.duration} onChange={(e) => set("duration", e.target.value)} />
        <TextField label="Bônus de pontos" inputMode="numeric" value={form.bonus} error={errors.pointsBonus} onChange={(e) => set("bonus", e.target.value)} hint="Pontos extras a cada atendimento deste serviço." />
        <div className="space-y-3 self-end">
          <Toggle label="Preço “a partir de”" checked={form.startingAt} onChange={(v) => set("startingAt", v)} />
          <Toggle label="Duração confirmada" description="Desmarque se ainda é uma estimativa." checked={form.confirmed} onChange={(v) => set("confirmed", v)} />
          <Toggle label="Ativo no site" checked={form.active} onChange={(v) => set("active", v)} />
        </div>
      </div>

      <div className="mt-6 border-t border-edge pt-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="label-caps text-xs text-soft">Preço por dia da semana (promoções)</p>
          <Button size="sm" variant="secondary" onClick={() => setRules([...rules, { weekdays: [], price: "", label: "" }])}>
            <IconPlus width={14} height={14} /> Regra
          </Button>
        </div>
        {rules.length === 0 && <p className="text-sm text-soft">Sem regras: o preço acima vale todos os dias.</p>}
        <div className="space-y-3">
          {rules.map((r, i) => (
            <div key={i} className="rounded-md border border-edge p-3">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dias da regra">
                {([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((d) => {
                  const on = r.weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setRules(rules.map((x, j) => j === i ? { ...x, weekdays: on ? x.weekdays.filter((w) => w !== d) : [...x.weekdays, d] } : x))}
                      className={`h-8 rounded-[3px] border px-2.5 text-xs ${on ? "border-accent bg-accent text-accent-fg" : "border-edge text-soft"}`}
                    >
                      {weekdayShort(d)}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
                <TextField label="Preço (R$)" inputMode="decimal" value={r.price} onChange={(e) => setRules(rules.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} />
                <TextField label="Rótulo" placeholder="Ex.: Promoção de terça e quarta" value={r.label} onChange={(e) => setRules(rules.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                <Button size="sm" variant="danger" onClick={() => setRules(rules.filter((_, j) => j !== i))}>Remover</Button>
              </div>
            </div>
          ))}
        </div>
        {errors.rules && <p role="alert" className="mt-2 text-sm text-bad">{errors.rules}</p>}
      </div>
    </Modal>
  );
}

export function ServicesAdmin() {
  const { services } = useAppState();
  const { busy, run } = useRun();
  const [editing, setEditing] = useState<Service | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Service | null>(null);
  const sorted = [...services].sort((a, b) => a.sortOrder - b.sortOrder);
  const unconfirmed = services.filter((s) => !s.durationConfirmed).length;

  function move(s: Service, dir: -1 | 1) {
    const i = sorted.findIndex((x) => x.id === s.id);
    const other = sorted[i + dir];
    if (!other) return;
    run(() =>
      api.admin((st) =>
        ({
          ...st,
          services: st.services.map((x) =>
            x.id === s.id ? { ...x, sortOrder: other.sortOrder } : x.id === other.id ? { ...x, sortOrder: s.sortOrder } : x,
          ),
        }),
      ),
    );
  }

  return (
    <>
      <PageTitle
        title="Serviços"
        description="O que aparece no site e pode ser agendado."
        actions={<Button onClick={() => setCreating(true)}><IconPlus width={16} height={16} /> Novo serviço</Button>}
      />
      {unconfirmed > 0 && (
        <div className="mb-4">
          <Notice tone="warn" title={`${unconfirmed} serviço(s) com duração estimada`}>
            A duração define os horários oferecidos na agenda. Confirme cada uma com a barbearia e marque “Duração confirmada”.
          </Notice>
        </div>
      )}
      <Card flush>
        {sorted.length === 0 ? (
          <div className="p-5"><EmptyState title="Nenhum serviço cadastrado" /></div>
        ) : (
          <TableWrap>
            <thead>
              <tr><TH>Serviço</TH><TH>Preço</TH><TH>Duração</TH><TH>Status</TH><TH className="text-right">Ações</TH></tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => (
                <tr key={s.id} className={s.active ? "" : "opacity-60"}>
                  <TD>
                    <span className="font-medium">{s.name}</span>
                    {s.priceRules.length > 0 && <span className="block text-xs text-soft">{s.priceRules.map((r) => r.label).join(" · ")}</span>}
                  </TD>
                  <TD className="whitespace-nowrap tabular-nums">{formatPrice(s.priceCents, s.priceIsStartingAt)}</TD>
                  <TD className="whitespace-nowrap">
                    {formatDuration(s.durationMinutes)} {!s.durationConfirmed && <Badge tone="warn">estimada</Badge>}
                  </TD>
                  <TD><Badge tone={s.active ? "good" : "neutral"}>{s.active ? "Ativo" : "Inativo"}</Badge></TD>
                  <TD className="whitespace-nowrap text-right">
                    <button type="button" aria-label={`Subir ${s.name}`} disabled={i === 0} onClick={() => move(s, -1)} className="px-2 py-1 text-soft hover:text-fg disabled:opacity-30">↑</button>
                    <button type="button" aria-label={`Descer ${s.name}`} disabled={i === sorted.length - 1} onClick={() => move(s, 1)} className="px-2 py-1 text-soft hover:text-fg disabled:opacity-30">↓</button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setRemoving(s)}>Excluir</Button>
                  </TD>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <ServiceDialog service={editing} open={creating || editing !== null} onClose={() => { setCreating(false); setEditing(null); }} />
      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Excluir serviço?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>Manter</Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                const r = await run(() => api.admin((st) => deleteService(st, removing!.id)), "Serviço excluído.");
                if (r.ok) setRemoving(null);
              }}
            >
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-soft">
          “{removing?.name}” deixa de existir. Se ele já tem agendamentos no histórico, o sistema pede para apenas desativar.
        </p>
      </Modal>
    </>
  );
}
