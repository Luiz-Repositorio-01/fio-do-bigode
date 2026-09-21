/**
 * Carregador de DADOS FICTÍCIOS para apresentação ao cliente.
 * Tudo é marcado como demonstração (isDemo) e pode ser removido de uma vez.
 * Usa os mesmos serviços de produção (createBooking/completeAppointment),
 * então o resultado é idêntico ao uso real, só que com clientes inventados.
 */
import type { DataState } from "@/types";
import { fromLocal, addDays, todayLocal } from "@/domain/time";
import { workWindows } from "@/domain/availability";
import { completeAppointment, createBooking } from "./booking";
import { upsertReward } from "./admin";
import { newId } from "@/utils/ids";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  "Lucas", "Rafael", "Bruno", "Diego", "Marcelo", "Felipe", "André", "Thiago",
  "Gustavo", "Eduardo", "Rodrigo", "Vinícius", "Caio", "Renato", "Fábio", "Leandro",
  "Daniel", "Matheus", "Otávio", "Henrique", "Paulo", "Sérgio", "Igor", "Murilo",
  "Ricardo", "Nelson", "Alex", "Davi",
];

type Pattern = { visits: number; every: number; lastAgo: number; vip?: boolean };

const PATTERNS: Pattern[] = [
  { visits: 7, every: 18, lastAgo: 6 },
  { visits: 6, every: 20, lastAgo: 12 },
  { visits: 4, every: 30, lastAgo: 14 },
  { visits: 3, every: 28, lastAgo: 22 },
  { visits: 1, every: 0, lastAgo: 4 },
  { visits: 1, every: 0, lastAgo: 9 },
  { visits: 2, every: 35, lastAgo: 38 },
  { visits: 3, every: 30, lastAgo: 68 },
  { visits: 2, every: 40, lastAgo: 104 },
  { visits: 12, every: 12, lastAgo: 3, vip: true },
];

export const DEMO_REWARDS = [
  { name: "Pezinho grátis (exemplo)", costPoints: 100, kind: "free_service" as const },
  { name: "Desconto de R$ 10 (exemplo)", costPoints: 180, kind: "discount" as const },
  { name: "Hidratação grátis (exemplo)", costPoints: 300, kind: "free_service" as const },
];

export function loadDemoData(state: DataState, now: number): DataState {
  if (state.customers.some((c) => c.isDemo)) return state;
  const rand = mulberry32(2026);
  let next = state;

  for (const r of DEMO_REWARDS) {
    next = upsertReward(next, {
      id: newId("rw"),
      businessId: next.business.id,
      name: r.name,
      description: "Recompensa de exemplo criada pelo modo demonstração.",
      kind: r.kind,
      costPoints: r.costPoints,
      validityDays: 30,
      stock: null,
      active: true,
      isDemo: true,
    });
  }

  const pros = next.professionals.filter((p) => p.active);
  const services = next.services.filter((s) => s.active);
  const cheap = services.filter((s) => (s.priceCents ?? 0) <= 8000);
  const today = todayLocal(now);

  const bookAt = (
    st: DataState,
    whatsapp: string,
    name: string,
    date: string,
    serviceId: string,
    birthDate: string | undefined,
    createdNow: number,
  ): { state: DataState; id: string } | null => {
    const service = st.services.find((s) => s.id === serviceId)!;
    const order = [...pros].sort(() => rand() - 0.5);
    for (const pro of order) {
      for (const win of workWindows(st.hours, pro.id, date)) {
        const span = win.closesMin - win.opensMin - service.durationMinutes;
        if (span < 0) continue;
        const start0 = win.opensMin + Math.floor((rand() * span) / 15) * 15;
        for (let k = 0; k < 12; k++) {
          const min = start0 + k * 15 > win.opensMin + span ? win.opensMin + (k * 15) % (span + 1) : start0 + k * 15;
          try {
            const r = createBooking(
              st,
              { serviceId, professionalId: pro.id, startsAt: fromLocal(date, min), name, whatsapp, birthDate },
              createdNow,
              { source: "admin" },
            );
            return { state: r.state, id: r.appointment.id };
          } catch {
            /* tenta o próximo horário */
          }
        }
      }
    }
    return null;
  };

  PATTERNS.forEach((pattern, pIdx) => {
    const perPattern = pIdx === 9 ? 1 : pIdx < 3 ? 4 : pIdx < 9 ? 3 : 1;
    for (let n = 0; n < perPattern; n++) {
      const idx = pIdx * 3 + n;
      const first = FIRST_NAMES[idx % FIRST_NAMES.length];
      const name = `${first} Demo`;
      const whatsapp = `1990000${String(idx + 1).padStart(4, "0")}`;
      const birthMonth = idx % 6 === 0 ? today.slice(5, 7) : String(1 + ((idx * 5) % 12)).padStart(2, "0");
      const birthDate = `${1985 + (idx % 15)}-${birthMonth}-${String(3 + ((idx * 7) % 24)).padStart(2, "0")}`;

      for (let v = 0; v < pattern.visits; v++) {
        const ago = pattern.lastAgo + (pattern.visits - 1 - v) * pattern.every + Math.floor(rand() * 4);
        let date = addDays(today, -ago);
        if (workWindows(next.hours, pros[0].id, date).length === 0) date = addDays(date, -1);
        const svc = pattern.vip && v % 2 === 0
          ? "svc_vip"
          : (cheap[Math.floor(rand() * cheap.length)] ?? services[0]).id;
        const t = new Date(fromLocal(date, 12 * 60)).getTime();
        const booked = bookAt(next, whatsapp, name, date, svc, birthDate, t - 2 * 86_400_000);
        if (!booked) continue;
        const done = completeAppointment(booked.state, { appointmentId: booked.id, finalPriceCents: null }, t);
        next = done.state;
      }
    }
  });

  // Marca tudo que veio do demo.
  const demoPhones = new Set(
    next.customers.filter((c) => /^551990000\d{4}$/.test(c.whatsapp)).map((c) => c.id),
  );
  next = {
    ...next,
    customers: next.customers.map((c) => (demoPhones.has(c.id) ? { ...c, isDemo: true } : c)),
  };

  // Alguns agendamentos futuros para a agenda e o painel "hoje/próximos".
  const futureCustomers = next.customers.filter((c) => c.isDemo).slice(0, 8);
  let dayOffset = 0;
  futureCustomers.forEach((c, i) => {
    let date = addDays(today, dayOffset);
    while (workWindows(next.hours, pros[0].id, date).length === 0) date = addDays(date, 1);
    const svc = cheap[(i * 3) % cheap.length];
    const r = bookAt(next, c.whatsapp, c.name, date, svc.id, undefined, now);
    // horários futuros respeitando antecedência: se passou, tenta o dia seguinte
    if (r) next = r.state;
    if (i % 3 === 2) dayOffset += 1;
  });
  // Descarta agendamentos "futuros" que caíram no passado do dia de hoje: viram concluídos.
  const nowIso = new Date(now).toISOString();
  for (const a of next.appointments.filter(
    (x) => x.status === "confirmed" && x.startsAt < nowIso,
  )) {
    next = completeAppointment(next, { appointmentId: a.id, finalPriceCents: null }, new Date(a.endsAt).getTime()).state;
  }
  return next;
}

/** Remove todos os registros de demonstração (clientes, histórico, pontos e recompensas). */
export function clearDemoData(state: DataState): DataState {
  const demoIds = new Set(state.customers.filter((c) => c.isDemo).map((c) => c.id));
  const demoApts = new Set(state.appointments.filter((a) => demoIds.has(a.customerId)).map((a) => a.id));
  const demoReferralIds = new Set(
    state.referrals.filter((r) => demoIds.has(r.referrerId) || demoIds.has(r.refereeId)).map((r) => r.id),
  );
  const demoRewardIds = new Set(state.rewards.filter((r) => r.isDemo).map((r) => r.id));
  return {
    ...state,
    customers: state.customers.filter((c) => !demoIds.has(c.id)),
    customerNotes: state.customerNotes.filter((n) => !demoIds.has(n.customerId)),
    appointments: state.appointments.filter((a) => !demoApts.has(a.id)),
    statusHistory: state.statusHistory.filter((h) => !demoApts.has(h.appointmentId)),
    ledger: state.ledger.filter((t) => !demoIds.has(t.customerId)),
    customerRewards: state.customerRewards.filter((r) => !demoIds.has(r.customerId)),
    referrals: state.referrals.filter((r) => !demoReferralIds.has(r.id)),
    referralEvents: state.referralEvents.filter((e) => !demoReferralIds.has(e.referralId)),
    rewards: state.rewards.filter((r) => !demoRewardIds.has(r.id)),
    settings:
      state.settings.loyalty.visitsRewardId && demoRewardIds.has(state.settings.loyalty.visitsRewardId)
        ? { ...state.settings, loyalty: { ...state.settings.loyalty, visitsRewardId: null } }
        : state.settings,
    campaigns: state.campaigns.map((c) => ({
      ...c,
      sentToCustomerIds: c.sentToCustomerIds.filter((id) => !demoIds.has(id)),
    })),
  };
}
