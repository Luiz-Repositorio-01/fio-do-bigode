/** Operações administrativas (CRUD) sobre o estado. Regras de integridade ficam aqui. */
import type {
  BlockedPeriod,
  BusinessHour,
  BusinessSettings,
  Campaign,
  Customer,
  DataState,
  GalleryImage,
  LoyaltyLevel,
  LoyaltyReward,
  Professional,
  PublicReview,
  Service,
} from "@/types";
import { newId, referralCodeFor } from "@/utils/ids";
import { normalizeWhatsApp } from "@/domain/whatsapp";
import { customerContactSchema, fieldErrors, type CustomerContactInput } from "@/schemas";
import { DomainError } from "./errors";
import { issueCustomerReward } from "./loyalty";

const upsert = <T extends { id: string }>(list: T[], item: T): T[] =>
  list.some((x) => x.id === item.id)
    ? list.map((x) => (x.id === item.id ? item : x))
    : [...list, item];

export const upsertService = (s: DataState, item: Service): DataState => ({
  ...s,
  services: upsert(s.services, item),
});

export function deleteService(s: DataState, id: string): DataState {
  if (s.appointments.some((a) => a.serviceId === id)) {
    throw new DomainError(
      "CONFLICT",
      "Este serviço tem agendamentos no histórico. Desative-o em vez de excluir.",
    );
  }
  return {
    ...s,
    services: s.services.filter((x) => x.id !== id),
    professionals: s.professionals.map((p) => ({
      ...p,
      serviceIds: p.serviceIds.filter((sid) => sid !== id),
    })),
  };
}

export const upsertProfessional = (s: DataState, item: Professional): DataState => ({
  ...s,
  professionals: upsert(s.professionals, item),
});

export function deleteProfessional(s: DataState, id: string): DataState {
  if (s.appointments.some((a) => a.professionalId === id)) {
    throw new DomainError(
      "CONFLICT",
      "Este profissional tem agendamentos no histórico. Desative-o em vez de excluir.",
    );
  }
  return {
    ...s,
    professionals: s.professionals.filter((x) => x.id !== id),
    hours: s.hours.filter((h) => h.professionalId !== id),
    blocks: s.blocks.filter((b) => b.professionalId !== id),
  };
}

/** Substitui todas as janelas de um escopo (professionalId null = barbearia). */
export function setHours(
  s: DataState,
  professionalId: string | null,
  rows: Array<Pick<BusinessHour, "weekday" | "opensMin" | "closesMin">>,
): DataState {
  for (const r of rows) {
    if (r.closesMin <= r.opensMin) {
      throw new DomainError("VALIDATION", "O fechamento precisa ser depois da abertura.");
    }
  }
  const byDay = new Map<number, typeof rows>();
  for (const r of rows) byDay.set(r.weekday, [...(byDay.get(r.weekday) ?? []), r]);
  for (const list of byDay.values()) {
    const sorted = [...list].sort((a, b) => a.opensMin - b.opensMin);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].opensMin < sorted[i - 1].closesMin) {
        throw new DomainError("VALIDATION", "Há janelas de horário sobrepostas no mesmo dia.");
      }
    }
  }
  const kept = s.hours.filter((h) => h.professionalId !== professionalId);
  const created: BusinessHour[] = rows.map((r) => ({
    id: newId("hour"),
    businessId: s.business.id,
    professionalId,
    weekday: r.weekday,
    opensMin: r.opensMin,
    closesMin: r.closesMin,
  }));
  return { ...s, hours: [...kept, ...created] };
}

export const addBlock = (s: DataState, b: Omit<BlockedPeriod, "id" | "businessId">): DataState => ({
  ...s,
  blocks: [...s.blocks, { ...b, id: newId("blk"), businessId: s.business.id }],
});

export const removeBlock = (s: DataState, id: string): DataState => ({
  ...s,
  blocks: s.blocks.filter((b) => b.id !== id),
});

export function upsertLevel(s: DataState, item: LoyaltyLevel): DataState {
  const others = s.levels.filter((l) => l.id !== item.id);
  if (others.some((l) => l.minPoints === item.minPoints)) {
    throw new DomainError("VALIDATION", "Já existe um nível com essa pontuação mínima.");
  }
  return { ...s, levels: upsert(s.levels, item) };
}

export function deleteLevel(s: DataState, id: string): DataState {
  if (s.levels.length <= 1) {
    throw new DomainError("CONFLICT", "Mantenha ao menos um nível de fidelidade.");
  }
  return { ...s, levels: s.levels.filter((l) => l.id !== id) };
}

export const upsertReward = (s: DataState, item: LoyaltyReward): DataState => ({
  ...s,
  rewards: upsert(s.rewards, item),
});

export function deleteReward(s: DataState, id: string): DataState {
  if (s.customerRewards.some((r) => r.rewardId === id)) {
    throw new DomainError(
      "CONFLICT",
      "Esta recompensa já foi resgatada por clientes. Desative-a em vez de excluir.",
    );
  }
  return {
    ...s,
    rewards: s.rewards.filter((r) => r.id !== id),
    settings:
      s.settings.loyalty.visitsRewardId === id
        ? { ...s.settings, loyalty: { ...s.settings.loyalty, visitsRewardId: null } }
        : s.settings,
  };
}

export const upsertCampaign = (s: DataState, item: Campaign): DataState => ({
  ...s,
  campaigns: upsert(s.campaigns, item),
});

export const deleteCampaign = (s: DataState, id: string): DataState => ({
  ...s,
  campaigns: s.campaigns.filter((c) => c.id !== id),
});

export const markCampaignSent = (s: DataState, campaignId: string, customerId: string): DataState => ({
  ...s,
  campaigns: s.campaigns.map((c) =>
    c.id === campaignId && !c.sentToCustomerIds.includes(customerId)
      ? { ...c, sentToCustomerIds: [...c.sentToCustomerIds, customerId] }
      : c,
  ),
});

export const addCustomerNote = (s: DataState, customerId: string, body: string, now: number): DataState => {
  const text = body.trim();
  if (!text) throw new DomainError("VALIDATION", "Escreva a observação.");
  return {
    ...s,
    customerNotes: [
      ...s.customerNotes,
      { id: newId("note"), customerId, body: text.slice(0, 1000), createdAt: new Date(now).toISOString() },
    ],
  };
};

export const deleteCustomerNote = (s: DataState, id: string): DataState => ({
  ...s,
  customerNotes: s.customerNotes.filter((n) => n.id !== id),
});

export function updateCustomer(
  s: DataState,
  id: string,
  patch: Partial<Pick<Customer, "name" | "whatsapp" | "email" | "birthDate">>,
): DataState {
  const current = s.customers.find((c) => c.id === id);
  if (!current) throw new DomainError("NOT_FOUND", "Cliente não encontrado.");
  const next = { ...current, ...patch };
  if (patch.whatsapp !== undefined) {
    const n = normalizeWhatsApp(patch.whatsapp);
    if (!n) throw new DomainError("VALIDATION", "WhatsApp inválido.", { whatsapp: "WhatsApp inválido." });
    if (s.customers.some((c) => c.id !== id && c.whatsapp === n)) {
      throw new DomainError("CONFLICT", "Já existe um cliente com esse WhatsApp.", {
        whatsapp: "Já existe um cliente com esse WhatsApp.",
      });
    }
    next.whatsapp = n;
  }
  if (!next.name.trim()) throw new DomainError("VALIDATION", "Informe o nome.", { name: "Informe o nome." });
  return { ...s, customers: s.customers.map((c) => (c.id === id ? next : c)) };
}

export const updateSettings = (
  s: DataState,
  patch: (current: BusinessSettings) => BusinessSettings,
): DataState => ({ ...s, settings: patch(s.settings) });

export const upsertReview = (s: DataState, r: PublicReview): DataState => ({
  ...s,
  reviews: upsert(s.reviews, r),
});
export const deleteReview = (s: DataState, id: string): DataState => ({
  ...s,
  reviews: s.reviews.filter((r) => r.id !== id),
});

export const addGalleryImage = (s: DataState, img: Omit<GalleryImage, "id">): DataState => ({
  ...s,
  gallery: [...s.gallery, { ...img, id: newId("img") }],
});
export const removeGalleryImage = (s: DataState, id: string): DataState => ({
  ...s,
  gallery: s.gallery.filter((g) => g.id !== id),
});

/** Cadastro manual de cliente pela equipe. */
export function createCustomer(
  s: DataState,
  raw: CustomerContactInput,
  now: number,
): { state: DataState; customer: Customer } {
  const parsed = customerContactSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DomainError("VALIDATION", "Confira os dados informados.", fieldErrors(parsed.error));
  }
  const input = parsed.data;
  if (s.customers.some((c) => c.whatsapp === input.whatsapp)) {
    throw new DomainError("CONFLICT", "Já existe um cliente com esse WhatsApp.", {
      whatsapp: "Já existe um cliente com esse WhatsApp.",
    });
  }
  const customer: Customer = {
    id: newId("cus"),
    businessId: s.business.id,
    name: input.name,
    whatsapp: input.whatsapp,
    email: input.email,
    birthDate: input.birthDate,
    referralCode: referralCodeFor(input.name, new Set(s.customers.map((c) => c.referralCode))),
    referredByCustomerId: null,
    createdAt: new Date(now).toISOString(),
    isDemo: false,
  };
  return { state: { ...s, customers: [...s.customers, customer] }, customer };
}

/** Concede um benefício sem custo de pontos (cortesia da equipe). */
export function grantReward(s: DataState, customerId: string, rewardId: string, now: number): DataState {
  const reward = s.rewards.find((r) => r.id === rewardId);
  if (!reward || !s.customers.some((c) => c.id === customerId)) {
    throw new DomainError("NOT_FOUND", "Recompensa ou cliente não encontrado.");
  }
  return issueCustomerReward(
    s,
    { customerId, rewardId, rewardName: reward.name, validityDays: reward.validityDays, source: "admin", pointsSpent: 0 },
    now,
  ).state;
}

export const cancelCustomerReward = (s: DataState, id: string): DataState => ({
  ...s,
  customerRewards: s.customerRewards.map((r) =>
    r.id === id && r.status === "available" ? { ...r, status: "cancelled" as const } : r,
  ),
});

/** Remove o cliente e TODO o histórico ligado a ele (direito de exclusão — LGPD). */
export function deleteCustomer(s: DataState, id: string): DataState {
  if (!s.customers.some((c) => c.id === id)) throw new DomainError("NOT_FOUND", "Cliente não encontrado.");
  const apptIds = new Set(s.appointments.filter((a) => a.customerId === id).map((a) => a.id));
  const refIds = new Set(
    s.referrals.filter((r) => r.referrerId === id || r.refereeId === id).map((r) => r.id),
  );
  return {
    ...s,
    customers: s.customers
      .filter((c) => c.id !== id)
      .map((c) => (c.referredByCustomerId === id ? { ...c, referredByCustomerId: null } : c)),
    customerNotes: s.customerNotes.filter((n) => n.customerId !== id),
    appointments: s.appointments.filter((a) => a.customerId !== id),
    statusHistory: s.statusHistory.filter((h) => !apptIds.has(h.appointmentId)),
    ledger: s.ledger.filter((t) => t.customerId !== id),
    customerRewards: s.customerRewards.filter((r) => r.customerId !== id),
    referrals: s.referrals.filter((r) => !refIds.has(r.id)),
    referralEvents: s.referralEvents.filter((e) => !refIds.has(e.referralId)),
    campaigns: s.campaigns.map((c) => ({
      ...c,
      sentToCustomerIds: c.sentToCustomerIds.filter((cid) => cid !== id),
    })),
  };
}

export function updateBusiness(
  s: DataState,
  patch: (current: DataState["business"]) => DataState["business"],
): DataState {
  return { ...s, business: patch(s.business) };
}
