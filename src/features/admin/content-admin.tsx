"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField, TextArea, TextField, Toggle } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Badge, EmptyState, Notice } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { fileToDataUrl } from "@/lib/image";
import { resetState, useAppState } from "@/lib/store/store";
import { addGalleryImage, deleteReview, removeGalleryImage, upsertReview } from "@/services/admin";
import { newId } from "@/utils/ids";
import { todayLocal } from "@/domain/time";
import { Card } from "./ui";
import { useRun } from "./use-run";

function GalleryCard() {
  const { gallery } = useAppState();
  const { busy, run } = useRun();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files).slice(0, 10)) {
        const src = await fileToDataUrl(file, 1400);
        await api.admin((s) => addGalleryImage(s, { src, alt: "Foto da Fio do Bigode Barbearia" }), true, 50);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar a imagem.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Card
      title="Galeria de fotos"
      description="Use fotos reais da barbearia (a primeira aparece na página inicial). Enquanto não houver fotos, o site mostra o convite para o Instagram."
      actions={
        <>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <Button size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>Enviar fotos</Button>
        </>
      }
    >
      <Notice tone="info">
        Na demonstração as fotos ficam guardadas só neste navegador (espaço limitado). No produto final vão para um
        armazenamento em nuvem.
      </Notice>
      {error && <div className="mt-3"><Notice tone="bad">{error}</Notice></div>}
      {gallery.length === 0 ? (
        <div className="mt-4"><EmptyState title="Nenhuma foto enviada" /></div>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {gallery.map((g, i) => (
            <li key={g.id} className="overflow-hidden rounded-md border border-edge">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.src} alt={g.alt} className="aspect-square w-full object-cover" />
              <div className="space-y-1.5 p-2">
                <input
                  aria-label="Descrição da foto (acessibilidade)"
                  defaultValue={g.alt}
                  maxLength={120}
                  onBlur={(e) => {
                    const alt = e.target.value.trim();
                    if (alt && alt !== g.alt) run(() => api.admin((s) => ({ ...s, gallery: s.gallery.map((x) => (x.id === g.id ? { ...x, alt } : x)) }), true, 50));
                  }}
                  className="h-8 w-full rounded border border-edge bg-panel px-2 text-xs"
                />
                <div className="flex items-center justify-between">
                  {i === 0 ? <Badge tone="accent">Capa</Badge> : <span />}
                  <button type="button" disabled={busy} onClick={() => run(() => api.admin((s) => removeGalleryImage(s, g.id), true, 50), "Foto removida.")} className="text-xs text-bad underline underline-offset-4">
                    Remover
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ReviewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { busy, run } = useRun();
  const [f, setF] = useState({ author: "", rating: "", text: "", source: "Google", url: "" });
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const rating = f.rating.trim() ? Number(f.rating.replace(",", ".")) : null;
    if (f.author.trim().length < 2 || f.text.trim().length < 5) return setError("Informe o autor e o texto do depoimento.");
    if (rating !== null && !(rating >= 1 && rating <= 5)) return setError("A nota deve ficar entre 1 e 5.");
    const r = await run(
      () =>
        api.admin((s) =>
          upsertReview(s, {
            id: newId("rev"),
            authorName: f.author.trim().slice(0, 60),
            rating,
            text: f.text.trim().slice(0, 600),
            date: todayLocal(),
            source: f.source.trim() || "Cliente",
            sourceUrl: f.url.trim(),
            published: true,
          }),
        ),
      "Depoimento adicionado.",
    );
    if (r.ok) {
      setF({ author: "", rating: "", text: "", source: "Google", url: "" });
      setError(null);
      onClose();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adicionar depoimento"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={save} loading={busy}>Adicionar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Notice tone="warn">Cadastre apenas avaliações reais, de clientes que autorizaram a divulgação. Não invente depoimentos.</Notice>
        <TextField label="Nome (pode abreviar)" value={f.author} onChange={(e) => setF({ ...f, author: e.target.value })} />
        <TextArea label="Depoimento" maxLength={600} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nota (1 a 5)" inputMode="decimal" optional value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })} />
          <SelectField label="Origem" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
            <option>Google</option><option>Instagram</option><option>WhatsApp</option><option>Avec</option><option>Presencial</option>
          </SelectField>
        </div>
        <TextField label="Link da avaliação original" type="url" optional value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
        {error && <Notice tone="bad">{error}</Notice>}
      </div>
    </Modal>
  );
}

function ReviewsCard() {
  const { reviews } = useAppState();
  const { busy, run } = useRun();
  const [adding, setAdding] = useState(false);
  return (
    <Card title="Depoimentos" description="Só os marcados como publicados aparecem no site." actions={<Button size="sm" variant="secondary" onClick={() => setAdding(true)}>Adicionar</Button>}>
      {reviews.length === 0 ? (
        <EmptyState title="Nenhum depoimento" />
      ) : (
        <ul className="divide-y divide-edge">
          {reviews.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {r.authorName} <span className="text-soft">· {r.source}{r.rating !== null ? ` · ${r.rating}★` : ""}</span>
                </p>
                <p className="mt-0.5 line-clamp-3 text-sm text-soft">{r.text}</p>
              </div>
              <div className="flex items-center gap-3">
                <Toggle label="Publicado" checked={r.published} onChange={(v) => run(() => api.admin((s) => upsertReview(s, { ...r, published: v }), true, 50))} disabled={busy} />
                <Button size="sm" variant="ghost" onClick={() => run(() => api.admin((s) => deleteReview(s, r.id), true, 50), "Depoimento removido.")}>Excluir</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ReviewDialog open={adding} onClose={() => setAdding(false)} />
    </Card>
  );
}

export function ContentAdmin() {
  return (
    <>
      <GalleryCard />
      <ReviewsCard />
    </>
  );
}

export function DataAdmin() {
  const state = useAppState();
  const { busy, run } = useRun();
  const [confirmReset, setConfirmReset] = useState(false);
  const hasDemo = state.customers.some((c) => c.isDemo);
  return (
    <>
      <Card title="Dados de demonstração" description="Clientes, agendamentos e pontos fictícios (“… Demo”, telefones inexistentes) para mostrar o sistema em uso.">
        <div className="flex flex-wrap gap-2">
          {hasDemo ? (
            <Button variant="danger" loading={busy} onClick={() => run(() => api.clearDemoData(), "Dados de demonstração removidos.")}>Remover dados de demonstração</Button>
          ) : (
            <Button loading={busy} onClick={() => run(() => api.loadDemoData(), "Dados de demonstração carregados.")}>Carregar dados de demonstração</Button>
          )}
        </div>
        <p className="mt-3 text-xs text-soft">Remover apaga só os registros marcados como demonstração; cadastros reais ficam intactos.</p>
      </Card>
      <Card title="Restaurar versão inicial" description="Apaga tudo o que foi feito neste navegador (agendamentos, clientes, fotos, ajustes) e volta ao conteúdo original.">
        <Button variant="danger" onClick={() => setConfirmReset(true)}>Restaurar tudo</Button>
      </Card>
      <Card title="Sobre esta versão">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-soft">
          <li>Todos os dados ficam no navegador deste aparelho — nada é enviado a servidor.</li>
          <li>WhatsApp funciona por link (wa.me): a equipe envia a mensagem, o sistema não envia sozinho.</li>
          <li>O acesso ao painel e à conta do cliente é simulado, sem segurança real.</li>
          <li>No produto final: banco PostgreSQL (Supabase) com regras de isolamento, login seguro e backups.</li>
        </ul>
      </Card>
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Restaurar tudo?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>Cancelar</Button>
            <Button variant="danger" onClick={() => { resetState(); setConfirmReset(false); }}>Restaurar</Button>
          </>
        }
      >
        <Notice tone="bad" title="Não dá para desfazer">Todos os dados deste navegador voltam ao estado original.</Notice>
      </Modal>
    </>
  );
}
