"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconPlus, IconX } from "@/components/ui/icons";
import { Notice } from "@/components/ui/misc";
import { hhmmToMinutes, minutesToHHmm, weekdayLong } from "@/domain/time";
import { api } from "@/lib/api";
import { useAppState } from "@/lib/store/store";
import { setHours } from "@/services/admin";
import type { Weekday } from "@/types";
import { useRun } from "./use-run";

type Draft = Record<Weekday, Array<{ open: string; close: string }>>;
const ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

function emptyDraft(): Draft {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

/**
 * Editor de expediente semanal. `professionalId = null` edita o horário da barbearia;
 * com um profissional, edita o horário próprio (vazio = segue o da barbearia).
 */
export function WeeklyHoursEditor({ professionalId }: { professionalId: string | null }) {
  const { hours } = useAppState();
  // key: se o expediente mudar (salvar, outra aba) ou trocar o profissional, o editor recomeça com o vigente.
  const signature = hours
    .filter((h) => h.professionalId === professionalId || h.professionalId === null)
    .map((h) => `${h.professionalId}:${h.weekday}:${h.opensMin}-${h.closesMin}`)
    .join("|");
  return <HoursEditorBody key={`${professionalId}#${signature}`} professionalId={professionalId} />;
}

function HoursEditorBody({ professionalId }: { professionalId: string | null }) {
  const { hours } = useAppState();
  const { busy, run } = useRun();
  const own = hours.filter((h) => h.professionalId === professionalId);
  const [draft, setDraft] = useState<Draft>(() => {
    const d = emptyDraft();
    // Profissional sem expediente próprio: mostra o horário da barbearia (que é o que vale hoje).
    const source = own.length > 0 || professionalId === null ? own : hours.filter((h) => h.professionalId === null);
    for (const h of [...source].sort((a, b) => a.opensMin - b.opensMin)) {
      d[h.weekday].push({ open: minutesToHHmm(h.opensMin), close: minutesToHHmm(h.closesMin) });
    }
    return d;
  });
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (fn: (d: Draft) => Draft) => {
    setDraft((d) => fn(d));
    setDirty(true);
  };

  async function save() {
    const rows = ORDER.flatMap((w) =>
      draft[w].map((r) => ({ weekday: w, opensMin: hhmmToMinutes(r.open), closesMin: hhmmToMinutes(r.close) })),
    );
    const r = await run(() => api.admin((s) => setHours(s, professionalId, rows)), "Horários salvos.");
    setError(r.ok ? null : r.error);
    if (r.ok) setDirty(false);
  }

  const usingShop = professionalId !== null && own.length === 0;

  return (
    <div>
      {professionalId !== null && (
        <div className="mb-3">
          {usingShop ? (
            <Notice>Este profissional segue o horário da barbearia. Adicione um horário abaixo para definir um expediente próprio.</Notice>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              onClick={() => run(() => api.admin((s) => setHours(s, professionalId, [])), "Agora segue o horário da barbearia.")}
            >
              Voltar a seguir o horário da barbearia
            </Button>
          )}
        </div>
      )}
      <ul className="divide-y divide-edge rounded-md border border-edge">
        {ORDER.map((w) => (
          <li key={w} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
            <span className="w-28 shrink-0 pt-2 text-sm font-medium first-letter:uppercase">{weekdayLong(w)}</span>
            <div className="min-w-0 flex-1 space-y-2">
              {draft[w].length === 0 && <p className="pt-2 text-sm text-soft">Fechado</p>}
              {draft[w].map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input
                    type="time"
                    aria-label={`${weekdayLong(w)}: abre às`}
                    value={r.open}
                    onChange={(e) => update((d) => ({ ...d, [w]: d[w].map((x, j) => (j === i ? { ...x, open: e.target.value } : x)) }))}
                    className="h-10 rounded-[3px] border border-edge bg-panel px-2.5 tabular-nums"
                  />
                  <span className="text-soft">às</span>
                  <input
                    type="time"
                    aria-label={`${weekdayLong(w)}: fecha às`}
                    value={r.close}
                    onChange={(e) => update((d) => ({ ...d, [w]: d[w].map((x, j) => (j === i ? { ...x, close: e.target.value } : x)) }))}
                    className="h-10 rounded-[3px] border border-edge bg-panel px-2.5 tabular-nums"
                  />
                  <button
                    type="button"
                    aria-label={`Remover janela de ${weekdayLong(w)}`}
                    onClick={() => update((d) => ({ ...d, [w]: d[w].filter((_, j) => j !== i) }))}
                    className="rounded p-2 text-soft hover:bg-panel-2 hover:text-bad"
                  >
                    <IconX width={16} height={16} />
                  </button>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                update((d) => ({
                  ...d,
                  [w]: [...d[w], d[w].length === 0 ? { open: "09:00", close: "18:00" } : { open: d[w][d[w].length - 1].close, close: "19:00" }],
                }))
              }
            >
              <IconPlus width={14} height={14} /> {draft[w].length === 0 ? "Abrir" : "Intervalo"}
            </Button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-soft">
        Duas janelas no mesmo dia formam um intervalo (ex.: 09:00–12:00 e 13:30–19:00).
      </p>
      {error && <div className="mt-3"><Notice tone="bad">{error}</Notice></div>}
      <div className="mt-4">
        <Button onClick={save} loading={busy} disabled={!dirty}>Salvar horários</Button>
      </div>
    </div>
  );
}
