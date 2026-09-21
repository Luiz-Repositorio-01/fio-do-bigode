"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconChevron, IconPlus } from "@/components/ui/icons";
import { SelectField } from "@/components/ui/form";
import { Toggle } from "@/components/ui/form";
import { workWindows } from "@/domain/availability";
import {
  addDays,
  formatDateLong,
  formatDateShort,
  formatMonthYear,
  fromLocal,
  minutesToHHmm,
  todayLocal,
  toLocalParts,
  weekdayOf,
  weekdayShort,
} from "@/domain/time";
import { useNow } from "@/hooks/use-now";
import { useAppState } from "@/lib/store/store";
import type { Appointment, AppointmentStatus, Professional } from "@/types";
import { AppointmentDialog } from "./appointment-dialog";
import { NewBookingDialog } from "./new-booking-dialog";
import { PageTitle, Segmented } from "./ui";

type View = "day" | "week" | "month";

const PX_PER_MIN = 1.15;

const BLOCK_STYLE: Record<AppointmentStatus, string> = {
  pending: "border-caution bg-caution/15",
  confirmed: "border-good bg-good/15",
  completed: "border-accent bg-accent/15",
  cancelled: "border-edge bg-panel-2 opacity-60 line-through",
  no_show: "border-bad bg-bad/15",
};

const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
function addMonths(d: string, n: number) {
  const [y, m] = d.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
}
const mondayOf = (d: string) => addDays(d, -((weekdayOf(d) + 6) % 7));

export function AgendaView() {
  const state = useAppState();
  const now = useNow(60_000);
  const today = todayLocal(now);
  const [view, setView] = useState<View>("day");
  const [date, setDate] = useState(today);
  const [proFilter, setProFilter] = useState("all");
  const [showCancelled, setShowCancelled] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const customerName = (id: string) => state.customers.find((c) => c.id === id)?.name ?? "—";

  const visible = useMemo(
    () =>
      state.appointments.filter(
        (a) =>
          (proFilter === "all" || a.professionalId === proFilter) &&
          (showCancelled || (a.status !== "cancelled" && a.status !== "no_show")),
      ),
    [state.appointments, proFilter, showCancelled],
  );
  const byDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of visible) {
      const d = toLocalParts(a.startsAt).date;
      map.set(d, [...(map.get(d) ?? []), a].sort((x, y) => x.startsAt.localeCompare(y.startsAt)));
    }
    return map;
  }, [visible]);

  function step(dir: -1 | 1) {
    if (view === "day") setDate(addDays(date, dir));
    else if (view === "week") setDate(addDays(date, 7 * dir));
    else setDate(addMonths(date, dir));
  }

  const title =
    view === "day"
      ? formatDateLong(date)
      : view === "week"
        ? `${formatDateShort(mondayOf(date))} a ${formatDateShort(addDays(mondayOf(date), 6))}`
        : formatMonthYear(date);

  const pros = state.professionals.filter((p) => p.active).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <>
      <PageTitle
        title="Agenda"
        actions={
          <Button onClick={() => setCreating(true)}>
            <IconPlus width={16} height={16} /> Novo agendamento
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Segmented
          label="Visão da agenda"
          value={view}
          onChange={setView}
          options={[
            { value: "day", label: "Dia" },
            { value: "week", label: "Semana" },
            { value: "month", label: "Mês" },
          ]}
        />
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" aria-label="Anterior" onClick={() => step(-1)}>
            <IconChevron className="rotate-180" width={16} height={16} />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDate(today)}>Hoje</Button>
          <Button variant="secondary" size="sm" aria-label="Próximo" onClick={() => step(1)}>
            <IconChevron width={16} height={16} />
          </Button>
        </div>
        <p className="display min-w-0 flex-1 text-xl first-letter:uppercase" aria-live="polite">{title}</p>
        <div className="w-full sm:w-52">
          <SelectField label="Profissional" value={proFilter} onChange={(e) => setProFilter(e.target.value)}>
            <option value="all">Todos</option>
            {state.professionals.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (inativo)"}</option>
            ))}
          </SelectField>
        </div>
        <div className="w-full sm:w-64">
          <Toggle label="Mostrar cancelados e faltas" checked={showCancelled} onChange={setShowCancelled} />
        </div>
      </div>

      {view === "day" && (
        <DayGrid
          date={date}
          pros={pros.filter((p) => proFilter === "all" || p.id === proFilter)}
          appointments={byDate.get(date) ?? []}
          onOpen={setOpenId}
          customerName={customerName}
        />
      )}
      {view === "week" && (
        <WeekGrid
          start={mondayOf(date)}
          today={today}
          byDate={byDate}
          customerName={customerName}
          onOpen={setOpenId}
          onDay={(d) => {
            setDate(d);
            setView("day");
          }}
        />
      )}
      {view === "month" && (
        <MonthGrid
          month={monthStart(date)}
          today={today}
          byDate={byDate}
          onDay={(d) => {
            setDate(d);
            setView("day");
          }}
        />
      )}

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-soft">
        {(
          [
            ["pending", "Pendente"],
            ["confirmed", "Confirmado"],
            ["completed", "Concluído"],
          ] as const
        ).map(([k, l]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded-sm border ${BLOCK_STYLE[k]}`} /> {l}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border border-bad/60 bg-[repeating-linear-gradient(45deg,transparent_0_3px,rgba(178,58,43,.35)_3px_6px)]" /> Bloqueio
        </span>
      </div>

      <AppointmentDialog appointmentId={openId} onClose={() => setOpenId(null)} />
      <NewBookingDialog
        open={creating}
        onClose={() => setCreating(false)}
        defaultDate={date < today ? today : date}
        defaultProfessionalId={proFilter === "all" ? undefined : proFilter}
      />
    </>
  );
}

function DayGrid({
  date,
  pros,
  appointments,
  onOpen,
  customerName,
}: {
  date: string;
  pros: Professional[];
  appointments: Appointment[];
  onOpen: (id: string) => void;
  customerName: (id: string) => string;
}) {
  const state = useAppState();
  const columns = useMemo(() => {
    const extra = state.professionals.filter(
      (p) => !p.active && appointments.some((a) => a.professionalId === p.id),
    );
    return [...pros, ...extra];
  }, [pros, appointments, state.professionals]);

  const { gridStart, gridEnd } = useMemo(() => {
    let lo = 8 * 60;
    let hi = 19 * 60;
    let any = false;
    for (const p of columns) {
      for (const w of workWindows(state.hours, p.id, date)) {
        lo = any ? Math.min(lo, w.opensMin) : w.opensMin;
        hi = any ? Math.max(hi, w.closesMin) : w.closesMin;
        any = true;
      }
    }
    for (const a of appointments) {
      const l = toLocalParts(a.startsAt);
      lo = Math.min(lo, l.minutes);
      hi = Math.max(hi, l.minutes + a.durationMinutes);
    }
    return { gridStart: Math.floor(lo / 60) * 60, gridEnd: Math.ceil(hi / 60) * 60 };
  }, [columns, state.hours, date, appointments]);

  const dayStart = new Date(fromLocal(date, 0)).getTime();
  const dayEnd = new Date(fromLocal(date, 1440)).getTime();
  const height = (gridEnd - gridStart) * PX_PER_MIN;
  const hoursList = Array.from({ length: (gridEnd - gridStart) / 60 + 1 }, (_, i) => gridStart + i * 60);
  const anyOpen = columns.some((p) => workWindows(state.hours, p.id, date).length > 0);

  if (columns.length === 0) {
    return <p className="rounded-md border border-dashed border-edge p-8 text-center text-soft">Nenhum profissional ativo.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-edge bg-panel">
      {!anyOpen && appointments.length === 0 && (
        <p className="border-b border-edge px-4 py-3 text-sm text-soft">A barbearia não abre neste dia.</p>
      )}
      <div className="flex min-w-[560px]">
        <div className="w-14 shrink-0 border-r border-edge" style={{ paddingTop: 44 }}>
          <div className="relative" style={{ height }}>
            {hoursList.map((m) => (
              <span
                key={m}
                className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-soft"
                style={{ top: (m - gridStart) * PX_PER_MIN }}
              >
                {minutesToHHmm(m)}
              </span>
            ))}
          </div>
        </div>
        {columns.map((p) => {
          const wins = workWindows(state.hours, p.id, date);
          const blocks = state.blocks.filter(
            (b) =>
              (b.professionalId === null || b.professionalId === p.id) &&
              new Date(b.startsAt).getTime() < dayEnd &&
              new Date(b.endsAt).getTime() > dayStart,
          );
          return (
            <div key={p.id} className="min-w-[180px] flex-1 border-r border-edge last:border-r-0">
              <div className="flex h-11 items-center justify-center border-b border-edge px-2">
                <span className="label-caps truncate text-xs">{p.name}{p.active ? "" : " (inativo)"}</span>
              </div>
              <div className="relative bg-panel-2" style={{ height }}>
                {wins.map((w) => (
                  <div
                    key={w.opensMin}
                    className="absolute inset-x-0 bg-panel"
                    style={{ top: (w.opensMin - gridStart) * PX_PER_MIN, height: (w.closesMin - w.opensMin) * PX_PER_MIN }}
                  />
                ))}
                {hoursList.map((m) => (
                  <div key={m} className="absolute inset-x-0 border-t border-edge/70" style={{ top: (m - gridStart) * PX_PER_MIN }} />
                ))}
                {blocks.map((b) => {
                  const s = Math.max(new Date(b.startsAt).getTime(), dayStart);
                  const e = Math.min(new Date(b.endsAt).getTime(), dayEnd);
                  const top = ((s - dayStart) / 60_000 - gridStart) * PX_PER_MIN;
                  const h = ((e - s) / 60_000) * PX_PER_MIN;
                  return (
                    <div
                      key={b.id}
                      title={b.reason || "Bloqueio"}
                      className="absolute inset-x-0 border-y border-bad/50 bg-[repeating-linear-gradient(45deg,transparent_0_4px,rgba(178,58,43,.22)_4px_8px)] px-1.5 text-[11px] text-bad"
                      style={{ top, height: h }}
                    >
                      {b.reason || "Bloqueio"}
                    </div>
                  );
                })}
                {appointments
                  .filter((a) => a.professionalId === p.id)
                  .map((a) => {
                    const l = toLocalParts(a.startsAt);
                    const h = Math.max(a.durationMinutes * PX_PER_MIN, 30);
                    const short = h < 44; // não cabem duas linhas: mostra hora, cliente e serviço em uma só
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => onOpen(a.id)}
                        className={`absolute inset-x-1 overflow-hidden rounded-[3px] border-l-4 px-2 ${short ? "flex items-center py-0" : "py-1"} text-left text-xs leading-tight shadow-sm hover:brightness-95 ${BLOCK_STYLE[a.status]}`}
                        style={{ top: (l.minutes - gridStart) * PX_PER_MIN, height: h - 2 }}
                      >
                        {short ? (
                          <span className="block truncate">
                            <span className="font-semibold">
                              {minutesToHHmm(l.minutes)} {customerName(a.customerId)}
                            </span>
                            <span className="text-soft"> · {a.serviceName}</span>
                          </span>
                        ) : (
                          <>
                            <span className="block truncate font-semibold">
                              {minutesToHHmm(l.minutes)} {customerName(a.customerId)}
                            </span>
                            <span className="block truncate text-soft">{a.serviceName}</span>
                          </>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({
  start,
  today,
  byDate,
  customerName,
  onOpen,
  onDay,
}: {
  start: string;
  today: string;
  byDate: Map<string, Appointment[]>;
  customerName: (id: string) => string;
  onOpen: (id: string) => void;
  onDay: (d: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid gap-3 md:grid-cols-7">
      {days.map((d) => {
        const list = byDate.get(d) ?? [];
        return (
          <section
            key={d}
            aria-label={formatDateLong(d)}
            className={`min-h-32 rounded-md border bg-panel ${d === today ? "border-accent" : "border-edge"}`}
          >
            <button
              type="button"
              onClick={() => onDay(d)}
              className="flex w-full items-baseline justify-between border-b border-edge px-3 py-2 text-left hover:bg-panel-2"
            >
              <span className="label-caps text-xs">{weekdayShort(weekdayOf(d))}</span>
              <span className="text-sm tabular-nums text-soft">{formatDateShort(d)}</span>
            </button>
            <ul className="space-y-1.5 p-2">
              {list.length === 0 && <li className="px-1 py-2 text-xs text-soft">—</li>}
              {list.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(a.id)}
                    className={`w-full rounded-[3px] border-l-4 px-2 py-1 text-left text-xs leading-tight ${BLOCK_STYLE[a.status]}`}
                  >
                    <span className="block truncate font-semibold">
                      {minutesToHHmm(toLocalParts(a.startsAt).minutes)} {customerName(a.customerId).split(" ")[0]}
                    </span>
                    <span className="block truncate text-soft">{a.serviceName}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function MonthGrid({
  month,
  today,
  byDate,
  onDay,
}: {
  month: string;
  today: string;
  byDate: Map<string, Appointment[]>;
  onDay: (d: string) => void;
}) {
  const [y, m] = month.split("-").map(Number);
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (weekdayOf(month) + 6) % 7; // segunda primeiro
  const cells: Array<string | null> = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: total }, (_, i) => `${month.slice(0, 8)}${String(i + 1).padStart(2, "0")}`),
  ];
  return (
    <div className="rounded-md border border-edge bg-panel p-3">
      <div className="mb-1 grid grid-cols-7 text-center">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((w) => (
          <span key={w} className="label-caps py-1 text-[11px] text-soft">{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) =>
          d === null ? (
            <span key={`e${i}`} />
          ) : (
            <button
              key={d}
              type="button"
              onClick={() => onDay(d)}
              aria-label={`${formatDateLong(d)}: ${(byDate.get(d) ?? []).length} agendamentos`}
              className={`flex aspect-square flex-col items-center justify-center rounded border text-sm tabular-nums hover:border-accent ${
                d === today ? "border-accent" : "border-edge"
              } ${(byDate.get(d)?.length ?? 0) > 0 ? "bg-accent/10" : ""}`}
            >
              <span>{Number(d.slice(8))}</span>
              {(byDate.get(d)?.length ?? 0) > 0 && (
                <span className="text-[11px] font-semibold text-accent-hi">{byDate.get(d)!.length}</span>
              )}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
