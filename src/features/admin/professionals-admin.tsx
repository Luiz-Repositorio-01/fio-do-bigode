"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconPlus } from "@/components/ui/icons";
import { TextArea, TextField, Toggle } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Badge, EmptyState, Notice, PhotoSlot } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { fileToDataUrl } from "@/lib/image";
import { useAppState } from "@/lib/store/store";
import { deleteProfessional, upsertProfessional } from "@/services/admin";
import { newId } from "@/utils/ids";
import type { Professional } from "@/types";
import { BlocksManager } from "./blocks-manager";
import { Card, PageTitle, Segmented } from "./ui";
import { useRun } from "./use-run";
import { WeeklyHoursEditor } from "./weekly-hours-editor";

function ProfessionalDialog(props: { pro: Professional | null; open: boolean; onClose: () => void }) {
  return props.open ? <ProfessionalDialogBody {...props} /> : null;
}

function ProfessionalDialogBody({ pro, open, onClose }: { pro: Professional | null; open: boolean; onClose: () => void }) {
  const { services, professionals, business } = useAppState();
  const { busy, run } = useRun();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(pro?.name ?? "");
  const [bio, setBio] = useState(pro?.bio ?? "");
  const [specialties, setSpecialties] = useState(pro?.specialties.join(", ") ?? "");
  const [serviceIds, setServiceIds] = useState<string[]>(() =>
    pro && pro.serviceIds.length > 0 ? pro.serviceIds : services.map((s) => s.id),
  );
  const [active, setActive] = useState(pro?.active ?? true);
  const [photo, setPhoto] = useState<string | null>(pro?.photoUrl ?? null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (name.trim().length < 2) return setError("Informe o nome.");
    const next: Professional = {
      id: pro?.id ?? newId("pro"),
      businessId: pro?.businessId ?? business.id,
      name: name.trim().slice(0, 60),
      photoUrl: photo,
      bio: bio.trim().slice(0, 500),
      specialties: specialties.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8),
      // Todos marcados = lista vazia ("realiza todos", inclusive serviços criados depois).
      serviceIds: serviceIds.length === services.length ? [] : serviceIds,
      active,
      sortOrder: pro?.sortOrder ?? Math.max(0, ...professionals.map((p) => p.sortOrder)) + 1,
      externalRating: pro?.externalRating ?? null,
      source: pro?.source ?? "Cadastrado no painel",
    };
    const r = await run(() => api.admin((s) => upsertProfessional(s, next)), "Profissional salvo.");
    if (r.ok) onClose();
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      setPhoto(await fileToDataUrl(file, 800));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível usar essa imagem.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={pro ? "Editar profissional" : "Novo profissional"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={save} loading={busy}>Salvar</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
        <div>
          <PhotoSlot src={photo} alt="Foto do profissional" className="aspect-square w-full rounded-md" />
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>{photo ? "Trocar" : "Enviar foto"}</Button>
            {photo && <Button size="sm" variant="ghost" onClick={() => setPhoto(null)}>Remover</Button>}
          </div>
        </div>
        <div className="space-y-4">
          <TextField label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <TextArea label="Apresentação" optional maxLength={500} value={bio} onChange={(e) => setBio(e.target.value)} />
          <TextField label="Especialidades" optional value={specialties} onChange={(e) => setSpecialties(e.target.value)} hint="Separe por vírgula. Ex.: degradê, barba, pigmentação" />
        </div>
      </div>
      <fieldset className="mt-5">
        <legend className="label-caps mb-2 text-xs text-soft">Serviços que realiza</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {[...services].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded border border-edge px-3 py-2 text-sm hover:border-accent">
              <input
                type="checkbox"
                checked={serviceIds.includes(s.id)}
                onChange={(e) => setServiceIds(e.target.checked ? [...serviceIds, s.id] : serviceIds.filter((x) => x !== s.id))}
                className="h-4 w-4 accent-[var(--c-accent)]"
              />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-5">
        <Toggle label="Ativo (aparece no site e recebe agendamentos)" checked={active} onChange={setActive} />
      </div>
      {error && <div className="mt-4"><Notice tone="bad">{error}</Notice></div>}
    </Modal>
  );
}

export function ProfessionalsAdmin() {
  const { professionals, appointments } = useAppState();
  const { busy, run } = useRun();
  const sorted = [...professionals].sort((a, b) => a.sortOrder - b.sortOrder);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Professional | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Professional | null>(null);
  const [tab, setTab] = useState<"hours" | "blocks">("hours");

  const selected = sorted.find((p) => p.id === selectedId) ?? sorted[0] ?? null;

  return (
    <>
      <PageTitle
        title="Barbeiros"
        description="Equipe, serviços de cada um, expediente e folgas."
        actions={<Button onClick={() => setCreating(true)}><IconPlus width={16} height={16} /> Novo profissional</Button>}
      />

      {sorted.length === 0 ? (
        <EmptyState title="Nenhum profissional cadastrado" description="Cadastre a equipe para liberar agendamentos." />
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((p) => {
              const isSel = selected?.id === p.id;
              return (
                <li key={p.id}>
                  <div className={`flex gap-4 rounded-md border bg-panel p-4 ${isSel ? "border-accent" : "border-edge"}`}>
                    <PhotoSlot src={p.photoUrl} alt={`Foto de ${p.name}`} className="h-16 w-16 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1">
                      <p className="display truncate text-lg">{p.name}</p>
                      <div className="mt-0.5 flex flex-wrap gap-1.5">
                        <Badge tone={p.active ? "good" : "neutral"}>{p.active ? "Ativo" : "Inativo"}</Badge>
                        <Badge tone="neutral">{p.serviceIds.length === 0 ? "Todos os serviços" : `${p.serviceIds.length} serviços`}</Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Button size="sm" variant={isSel ? "primary" : "secondary"} onClick={() => setSelectedId(p.id)}>Horários</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Editar</Button>
                        <Button size="sm" variant="ghost" onClick={() => setRemoving(p)}>Excluir</Button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {selected && (
            <Card
              className="mt-6"
              title={`Agenda de ${selected.name}`}
              actions={
                <Segmented
                  label="Seção"
                  value={tab}
                  onChange={setTab}
                  options={[{ value: "hours", label: "Expediente" }, { value: "blocks", label: "Folgas" }]}
                />
              }
            >
              {tab === "hours" ? <WeeklyHoursEditor professionalId={selected.id} /> : <BlocksManager scope={selected.id} />}
            </Card>
          )}
        </>
      )}

      <ProfessionalDialog pro={editing} open={creating || editing !== null} onClose={() => { setCreating(false); setEditing(null); }} />
      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Excluir profissional?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>Manter</Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                const r = await run(() => api.admin((s) => deleteProfessional(s, removing!.id)), "Profissional excluído.");
                if (r.ok) setRemoving(null);
              }}
            >
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-soft">
          {removing && appointments.some((a) => a.professionalId === removing.id)
            ? `${removing.name} tem agendamentos no histórico: o sistema vai pedir para apenas desativar.`
            : `${removing?.name} e seus horários serão removidos.`}
        </p>
      </Modal>
    </>
  );
}
