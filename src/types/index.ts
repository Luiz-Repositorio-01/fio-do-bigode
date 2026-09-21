/**
 * Modelo de domínio do Fio do Bigode.
 *
 * Os nomes e campos espelham as tabelas planejadas para o Supabase
 * (supabase/migrations). Toda entidade relevante carrega `businessId`
 * para permitir multi-tenancy no futuro.
 */

/** 0 = domingo ... 6 = sábado (mesma convenção do Date.getUTCDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

/** Status que ocupam o horário da agenda (impedem double booking). */
export const SLOT_OCCUPYING_STATUSES: readonly AppointmentStatus[] = [
  "pending",
  "confirmed",
  "completed",
];

export interface Business {
  id: string;
  slug: string;
  name: string;
  legalTagline: string;
  description: string;
  address: {
    street: string;
    neighborhood: string;
    city: string;
    state: string;
    zip: string;
  };
  whatsappE164: string; // somente dígitos, com DDI: 5519998647135
  whatsappDisplay: string;
  instagram: { handle: string; url: string };
  rating: { value: number; count: number; source: string; url: string } | null;
}

export type RoundingMode = "floor" | "round" | "ceil";
export type LoyaltyModel = "points" | "visits" | "hybrid";

export interface BusinessSettings {
  businessId: string;
  minNoticeMinutes: number;
  bookingWindowDays: number;
  slotIntervalMinutes: number;
  /** Cliente só pode cancelar/remarcar sozinho até X horas antes. */
  customerChangeLimitHours: number;
  autoConfirm: boolean;
  loyalty: {
    enabled: boolean;
    model: LoyaltyModel;
    pointsPerReal: number;
    pointsPerVisit: number;
    rounding: RoundingMode;
    pointsValidityDays: number | null;
    visitsGoal: number;
    visitsRewardId: string | null;
    birthdayBonusPoints: number;
    referral: {
      enabled: boolean;
      referrerPoints: number;
      refereePoints: number;
      monthlyLimit: number;
    };
  };
  /** Mensagens de WhatsApp personalizadas pela barbearia (chave = MessageTemplateKey). */
  messageTemplates?: Partial<Record<string, string>>;
  retention: {
    inactiveDays: [number, number, number];
    recurringMinVisits: number;
    newCustomerDays: number;
    birthdayLookaheadDays: number;
  };
}

export interface BusinessHour {
  id: string;
  businessId: string;
  /** null = horário padrão da barbearia. */
  professionalId: string | null;
  weekday: Weekday;
  /** Janela de trabalho em minutos desde 00:00. Várias janelas = intervalo. */
  opensMin: number;
  closesMin: number;
}

export interface Professional {
  id: string;
  businessId: string;
  name: string;
  photoUrl: string | null;
  bio: string;
  specialties: string[];
  serviceIds: string[];
  active: boolean;
  sortOrder: number;
  /** Nota pública em plataforma externa, quando informada. */
  externalRating: { value: number; count: number; source: string } | null;
  /** Onde a informação foi encontrada (auditoria). */
  source: string;
}

export interface PriceRule {
  weekdays: Weekday[];
  priceCents: number;
  label: string;
}

export interface Service {
  id: string;
  businessId: string;
  name: string;
  description: string;
  priceCents: number | null; // null = "Consultar"
  priceIsStartingAt: boolean;
  priceRules: PriceRule[];
  durationMinutes: number;
  /** false = duração de demonstração, precisa ser confirmada pela barbearia. */
  durationConfirmed: boolean;
  pointsBonus: number;
  active: boolean;
  sortOrder: number;
}

export interface BlockedPeriod {
  id: string;
  businessId: string;
  professionalId: string | null; // null = toda a barbearia
  startsAt: string;
  endsAt: string;
  kind: "block" | "vacation" | "holiday" | "maintenance";
  reason: string;
}

export interface Customer {
  id: string;
  businessId: string;
  name: string;
  whatsapp: string; // E.164 sem "+"
  email: string | null;
  birthDate: string | null; // YYYY-MM-DD
  referralCode: string;
  referredByCustomerId: string | null;
  createdAt: string;
  /** Marca registros criados pelo carregador de dados de demonstração. */
  isDemo: boolean;
}

export interface CustomerNote {
  id: string;
  customerId: string;
  body: string;
  createdAt: string;
}

export interface Appointment {
  id: string;
  businessId: string;
  customerId: string;
  professionalId: string;
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  /** Preço calculado no servidor no momento da reserva. */
  priceCents: number | null;
  priceIsStartingAt: boolean;
  /** Valor efetivamente cobrado (definido ao concluir). */
  finalPriceCents: number | null;
  customerNotes: string;
  manageToken: string;
  source: "site" | "admin";
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  rescheduledFromStartsAt: string | null;
  pointsAwarded: number;
}

export interface AppointmentStatusHistory {
  id: string;
  appointmentId: string;
  fromStatus: AppointmentStatus | null;
  toStatus: AppointmentStatus;
  actor: "customer" | "admin" | "system";
  note: string;
  createdAt: string;
}

export type LoyaltyTransactionType =
  | "EARN"
  | "REDEEM"
  | "ADJUSTMENT"
  | "EXPIRE"
  | "BONUS";

/** Ledger append-only. O saldo é sempre a soma de `amount`. */
export interface LoyaltyTransaction {
  id: string;
  businessId: string;
  customerId: string;
  type: LoyaltyTransactionType;
  amount: number; // com sinal
  description: string;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface LoyaltyLevel {
  id: string;
  businessId: string;
  name: string;
  minPoints: number;
  discountPercent: number | null;
  benefits: string;
  isVip: boolean;
}

export type RewardKind = "discount" | "free_service" | "upgrade" | "other";

export interface LoyaltyReward {
  id: string;
  businessId: string;
  name: string;
  description: string;
  kind: RewardKind;
  costPoints: number;
  /** Dias de validade do benefício após o resgate. */
  validityDays: number | null;
  stock: number | null; // null = ilimitado
  active: boolean;
  isDemo: boolean;
}

export type CustomerRewardStatus =
  | "available"
  | "used"
  | "expired"
  | "cancelled";

export interface CustomerReward {
  id: string;
  businessId: string;
  customerId: string;
  rewardId: string;
  rewardName: string;
  /** Identificador seguro (pronto para virar QR Code / código de resgate). */
  code: string;
  status: CustomerRewardStatus;
  pointsSpent: number;
  source: "points" | "visits" | "birthday" | "campaign" | "admin";
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
}

export type ReferralStatus = "registered" | "qualified" | "rejected";

export interface Referral {
  id: string;
  businessId: string;
  referrerId: string;
  refereeId: string;
  status: ReferralStatus;
  createdAt: string;
}

export interface ReferralEvent {
  id: string;
  referralId: string;
  type: "registered" | "qualified" | "rejected";
  points: number;
  note: string;
  createdAt: string;
}

export type CampaignKind = "points_multiplier" | "bonus_points" | "message";
export type CustomerSegmentKey =
  | "all"
  | "active"
  | "recurring"
  | "new"
  | "inactive"
  | "vip"
  | "birthday";

export interface Campaign {
  id: string;
  businessId: string;
  name: string;
  kind: CampaignKind;
  startsAt: string;
  endsAt: string;
  multiplier: number | null;
  bonusPoints: number | null;
  segment: CustomerSegmentKey;
  messageTemplate: string;
  active: boolean;
  /** Clientes marcados manualmente como "mensagem enviada". */
  sentToCustomerIds: string[];
}

export interface PublicReview {
  id: string;
  authorName: string;
  /** Nota individual quando a fonte a informa (null = não informada). */
  rating: number | null;
  text: string;
  date: string;
  source: string;
  sourceUrl: string;
  published: boolean;
}

export interface GalleryImage {
  id: string;
  src: string;
  alt: string;
}

/** Estado completo persistido (no demo, em localStorage). */
export interface DataState {
  version: number;
  business: Business;
  settings: BusinessSettings;
  professionals: Professional[];
  services: Service[];
  hours: BusinessHour[];
  blocks: BlockedPeriod[];
  customers: Customer[];
  customerNotes: CustomerNote[];
  appointments: Appointment[];
  statusHistory: AppointmentStatusHistory[];
  ledger: LoyaltyTransaction[];
  levels: LoyaltyLevel[];
  rewards: LoyaltyReward[];
  customerRewards: CustomerReward[];
  referrals: Referral[];
  referralEvents: ReferralEvent[];
  campaigns: Campaign[];
  reviews: PublicReview[];
  gallery: GalleryImage[];
}

export interface Slot {
  professionalId: string;
  startsAt: string;
  endsAt: string;
  startMin: number;
}
