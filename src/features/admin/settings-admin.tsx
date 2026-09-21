"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField, TextArea, TextField, Toggle } from "@/components/ui/form";
import { DEFAULT_TEMPLATES, MESSAGE_TEMPLATE_LABELS, renderTemplate, type MessageTemplateKey } from "@/domain/whatsapp";
import { api } from "@/lib/api";
import { useAppState } from "@/lib/store/store";
import { updateBusiness, updateSettings } from "@/services/admin";
import { BlocksManager } from "./blocks-manager";
import { ContentAdmin, DataAdmin } from "./content-admin";
import { Card, PageTitle, Segmented } from "./ui";
import { useRun } from "./use-run";
import { WeeklyHoursEditor } from "./weekly-hours-editor";

const int = (v: string, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function BusinessCard() {
  const { business } = useAppState();
  return <BusinessForm key={JSON.stringify(business)} />;
}

function BusinessForm() {
  const { business } = useAppState();
  const { busy, run } = useRun();
  const [f, setF] = useState({
    name: business.name, description: business.description, street: business.address.street, neighborhood: business.address.neighborhood,
    city: business.address.city, state: business.address.state, zip: business.address.zip,
    whatsapp: business.whatsappE164, whatsappDisplay: business.whatsappDisplay, igHandle: business.instagram.handle, igUrl: business.instagram.url,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <Card title="Dados da barbearia" description="Aparecem no site, no rodapé, nos mapas e nas mensagens.">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nome" value={f.name} onChange={set("name")} />
        <TextField label="WhatsApp (só números, com 55)" inputMode="numeric" value={f.whatsapp} onChange={set("whatsapp")} />
        <TextField label="WhatsApp como exibido" value={f.whatsappDisplay} onChange={set("whatsappDisplay")} />
        <TextField label="Instagram (@)" value={f.igHandle} onChange={set("igHandle")} />
        <TextField label="Endereço" value={f.street} onChange={set("street")} />
        <TextField label="Bairro" value={f.neighborhood} onChange={set("neighborhood")} />
        <TextField label="Cidade" value={f.city} onChange={set("city")} />
        <div className="grid grid-cols-2 gap-4">
          <TextField label="UF" maxLength={2} value={f.state} onChange={set("state")} />
          <TextField label="CEP" value={f.zip} onChange={set("zip")} />
        </div>
        <TextField label="Link do Instagram" wrapperClassName="sm:col-span-2" value={f.igUrl} onChange={set("igUrl")} />
        <TextArea label="Descrição curta (site e Google)" wrapperClassName="sm:col-span-2" value={f.description} onChange={set("description")} />
      </div>
      <div className="mt-5">
        <Button
          loading={busy}
          onClick={() =>
            run(
              () =>
                api.admin((s) =>
                  updateBusiness(s, (b) => ({
                    ...b,
                    name: f.name.trim() || b.name,
                    description: f.description.trim(),
                    address: { street: f.street.trim(), neighborhood: f.neighborhood.trim(), city: f.city.trim(), state: f.state.trim().toUpperCase(), zip: f.zip.trim() },
                    whatsappE164: f.whatsapp.replace(/\D/g, ""),
                    whatsappDisplay: f.whatsappDisplay.trim(),
                    instagram: { handle: f.igHandle.trim(), url: f.igUrl.trim() },
                  })),
                ),
              "Dados salvos.",
            )
          }
        >
          Salvar
        </Button>
      </div>
    </Card>
  );
}

function BookingCard() {
  const { settings } = useAppState();
  return <BookingForm key={JSON.stringify([settings.minNoticeMinutes, settings.bookingWindowDays, settings.slotIntervalMinutes, settings.customerChangeLimitHours, settings.autoConfirm])} />;
}

function BookingForm() {
  const { settings } = useAppState();
  const { busy, run } = useRun();
  const [f, setF] = useState({
    notice: String(settings.minNoticeMinutes), window: String(settings.bookingWindowDays), slot: String(settings.slotIntervalMinutes),
    limit: String(settings.customerChangeLimitHours), auto: settings.autoConfirm,
  });

  return (
    <Card title="Regras de agendamento">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Antecedência mínima (minutos)" inputMode="numeric" value={f.notice} onChange={(e) => setF({ ...f, notice: e.target.value })} hint="Quanto antes do horário o cliente ainda pode agendar pelo site." />
        <TextField label="Agenda aberta para (dias à frente)" inputMode="numeric" value={f.window} onChange={(e) => setF({ ...f, window: e.target.value })} />
        <SelectField label="Intervalo entre horários" value={f.slot} onChange={(e) => setF({ ...f, slot: e.target.value })}>
          {[10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} minutos</option>)}
        </SelectField>
        <TextField label="Cliente pode cancelar/remarcar até (horas antes)" inputMode="numeric" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} />
      </div>
      <div className="mt-5">
        <Toggle label="Confirmar automaticamente" description="Desligado, novos agendamentos do site ficam “pendentes” até a equipe confirmar." checked={f.auto} onChange={(v) => setF({ ...f, auto: v })} />
      </div>
      <div className="mt-5">
        <Button
          loading={busy}
          onClick={() =>
            run(
              () =>
                api.admin((s) =>
                  updateSettings(s, (c) => ({
                    ...c,
                    minNoticeMinutes: int(f.notice, 0, 10080, c.minNoticeMinutes),
                    bookingWindowDays: int(f.window, 1, 365, c.bookingWindowDays),
                    slotIntervalMinutes: int(f.slot, 5, 120, c.slotIntervalMinutes),
                    customerChangeLimitHours: int(f.limit, 0, 720, c.customerChangeLimitHours),
                    autoConfirm: f.auto,
                  })),
                ),
              "Regras salvas.",
            )
          }
        >
          Salvar regras
        </Button>
      </div>
    </Card>
  );
}

function RetentionCard() {
  const { settings } = useAppState();
  return <RetentionForm key={JSON.stringify(settings.retention)} />;
}

function RetentionForm() {
  const { settings } = useAppState();
  const { busy, run } = useRun();
  const r = settings.retention;
  const [f, setF] = useState({ d1: String(r.inactiveDays[0]), d2: String(r.inactiveDays[1]), d3: String(r.inactiveDays[2]), rec: String(r.recurringMinVisits), nw: String(r.newCustomerDays), bd: String(r.birthdayLookaheadDays) });
  return (
    <Card title="Segmentos de clientes" description="Como o CRM separa clientes ativos, inativos, novos e recorrentes.">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Inativo após (dias) — nível 1" inputMode="numeric" value={f.d1} onChange={(e) => setF({ ...f, d1: e.target.value })} />
        <TextField label="Nível 2 (dias)" inputMode="numeric" value={f.d2} onChange={(e) => setF({ ...f, d2: e.target.value })} />
        <TextField label="Nível 3 (dias)" inputMode="numeric" value={f.d3} onChange={(e) => setF({ ...f, d3: e.target.value })} />
        <TextField label="Recorrente a partir de (visitas)" inputMode="numeric" value={f.rec} onChange={(e) => setF({ ...f, rec: e.target.value })} />
        <TextField label="Cliente “novo” por (dias)" inputMode="numeric" value={f.nw} onChange={(e) => setF({ ...f, nw: e.target.value })} />
        <TextField label="Aniversariantes: próximos (dias)" inputMode="numeric" value={f.bd} onChange={(e) => setF({ ...f, bd: e.target.value })} />
      </div>
      <div className="mt-5">
        <Button
          loading={busy}
          onClick={() => {
            const days = [int(f.d1, 1, 3650, 30), int(f.d2, 1, 3650, 60), int(f.d3, 1, 3650, 90)].sort((a, b) => a - b) as [number, number, number];
            return run(
              () =>
                api.admin((s) =>
                  updateSettings(s, (c) => ({
                    ...c,
                    retention: { inactiveDays: days, recurringMinVisits: int(f.rec, 1, 1000, 3), newCustomerDays: int(f.nw, 1, 365, 30), birthdayLookaheadDays: int(f.bd, 0, 365, 7) },
                  })),
                ),
              "Segmentos salvos.",
            );
          }}
        >
          Salvar
        </Button>
      </div>
    </Card>
  );
}

const SAMPLE_VARS = { NOME: "João", SERVIÇO: "Corte", PROFISSIONAL: "Henrique", DATA: "segunda-feira, 22 de setembro", HORÁRIO: "14:00", PONTOS: 120 };

function MessagesCard() {
  const { settings } = useAppState();
  const { busy, run } = useRun();
  const keys = Object.keys(MESSAGE_TEMPLATE_LABELS) as MessageTemplateKey[];
  const [key, setKey] = useState<MessageTemplateKey>("reminder");
  const current = settings.messageTemplates?.[key] ?? DEFAULT_TEMPLATES[key];
  // Edições em andamento por modelo; sem edição, mostra o texto vigente.
  const [edits, setEdits] = useState<Partial<Record<MessageTemplateKey, string>>>({});
  const text = edits[key] ?? current;
  const setText = (v: string) => setEdits((e) => ({ ...e, [key]: v }));

  return (
    <Card title="Mensagens de WhatsApp" description="Modelos usados nos botões “WhatsApp” do painel e do site.">
      <div className="space-y-4">
        <SelectField label="Modelo" value={key} onChange={(e) => setKey(e.target.value as MessageTemplateKey)}>
          {keys.map((k) => <option key={k} value={k}>{MESSAGE_TEMPLATE_LABELS[k]}</option>)}
        </SelectField>
        <TextArea label="Texto" rows={6} maxLength={800} value={text} onChange={(e) => setText(e.target.value)} hint="Variáveis: {NOME} {SERVIÇO} {PROFISSIONAL} {DATA} {HORÁRIO} {PONTOS}" />
        <div>
          <p className="label-caps mb-1.5 text-xs text-soft">Pré-visualização</p>
          <p className="whitespace-pre-wrap rounded-md border border-edge bg-panel-2 p-3 text-sm">{renderTemplate(text, SAMPLE_VARS)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            loading={busy}
            onClick={() => run(() => api.admin((s) => updateSettings(s, (c) => ({ ...c, messageTemplates: { ...c.messageTemplates, [key]: text.trim() || undefined } }))), "Modelo salvo.")}
          >
            Salvar modelo
          </Button>
          <Button variant="ghost" onClick={() => run(() => api.admin((s) => updateSettings(s, (c) => ({ ...c, messageTemplates: { ...c.messageTemplates, [key]: undefined } }))), "Modelo restaurado.")}>
            Restaurar padrão
          </Button>
        </div>
      </div>
    </Card>
  );
}

type Tab = "shop" | "booking" | "hours" | "messages" | "content" | "data";

export function SettingsAdmin() {
  const [tab, setTab] = useState<Tab>("shop");
  return (
    <>
      <PageTitle title="Configurações" />
      <div className="mb-6 overflow-x-auto">
        <Segmented
          label="Seção"
          value={tab}
          onChange={setTab}
          options={[
            { value: "shop", label: "Barbearia" },
            { value: "booking", label: "Agendamento" },
            { value: "hours", label: "Horários" },
            { value: "messages", label: "Mensagens" },
            { value: "content", label: "Site" },
            { value: "data", label: "Dados" },
          ]}
        />
      </div>
      <div className="space-y-6">
        {tab === "shop" && <><BusinessCard /><RetentionCard /></>}
        {tab === "booking" && <BookingCard />}
        {tab === "hours" && (
          <>
            <Card title="Horário de funcionamento" description="Vale para todos os profissionais que não têm expediente próprio.">
              <WeeklyHoursEditor professionalId={null} />
            </Card>
            <Card title="Fechamentos da barbearia" description="Feriados, recesso, manutenção.">
              <BlocksManager scope="shop" />
            </Card>
          </>
        )}
        {tab === "messages" && <MessagesCard />}
        {tab === "content" && <ContentAdmin />}
        {tab === "data" && <DataAdmin />}
      </div>
    </>
  );
}
