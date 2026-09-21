/**
 * Dados iniciais do Fio do Bigode.
 *
 * REGRA: só entra aqui o que foi encontrado em fontes públicas da própria
 * barbearia (Instagram @fiodobigodepiracicaba e página de agendamento no Avec).
 * O que não foi encontrado fica vazio/configurável e é marcado abaixo como
 * [INFORMAÇÃO NÃO ENCONTRADA]. Nada aqui é dado de cliente.
 *
 * Fontes (consultadas em 21/09/2026):
 *  - https://www.instagram.com/fiodobigodepiracicaba/
 *  - https://www.avec.app/fio-do-bigodebarbershop/
 */
import type {
  BusinessHour,
  DataState,
  GalleryImage,
  LoyaltyLevel,
  Professional,
  PublicReview,
  Service,
  Weekday,
} from "@/types";

export const BUSINESS_ID = "biz_fio_do_bigode";
export const DATA_VERSION = 2;

/**
 * Indexação em buscadores. A versão de demonstração NÃO deve ser indexada (dados fictícios,
 * painel aberto). Ao lançar de verdade, defina NEXT_PUBLIC_ALLOW_INDEXING=true no ambiente.
 */
export const ALLOW_INDEXING = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true";

const AVEC_URL = "https://www.avec.app/fio-do-bigodebarbershop/";
const INSTAGRAM_URL = "https://www.instagram.com/fiodobigodepiracicaba/";

/** URL pública do site. Valor ausente, vazio ou inválido cai no localhost (evita quebrar o build). */
function resolveSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return "http://localhost:3000";
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export const SITE = {
  name: "Fio do Bigode",
  fullName: "Fio do Bigode Barbearia",
  city: "Piracicaba",
  url: resolveSiteUrl(),
} as const;

const TUE_WED: Weekday[] = [2, 3];

function service(
  n: number,
  id: string,
  name: string,
  price: number | null,
  opts: Partial<Pick<Service, "priceIsStartingAt" | "description" | "priceRules">> & {
    duration: number;
  },
): Service {
  return {
    id: `svc_${id}`,
    businessId: BUSINESS_ID,
    name,
    description: opts.description ?? "",
    priceCents: price === null ? null : price * 100,
    priceIsStartingAt: opts.priceIsStartingAt ?? false,
    priceRules: opts.priceRules ?? [],
    durationMinutes: opts.duration,
    // [INFORMAÇÃO NÃO ENCONTRADA] duração real de cada serviço.
    durationConfirmed: false,
    pointsBonus: 0,
    active: true,
    sortOrder: n,
  };
}

const tueWed = (priceReais: number) => [
  { weekdays: TUE_WED, priceCents: priceReais * 100, label: "Terça e quarta" },
];

/** Serviços e preços publicados no Avec (terça/quarta viraram regra de preço). */
export const SEED_SERVICES: Service[] = [
  service(1, "corte", "Corte de Cabelo", 60, {
    priceIsStartingAt: true,
    priceRules: tueWed(55),
    duration: 45,
  }),
  service(2, "corte_sobrancelha", "Corte de Cabelo e Sobrancelha", 65, {
    priceIsStartingAt: true,
    description:
      "Corte moderno e aparo de sobrancelhas na navalha para um visual impecável.",
    duration: 60,
  }),
  service(3, "barba", "Barba Completa", 60, {
    priceIsStartingAt: true,
    priceRules: tueWed(55),
    description: "Barba feita com maestria e cuidado, com protocolos de biossegurança rigorosos.",
    duration: 30,
  }),
  service(4, "barba_pezinho", "Barba Completa e Pezinho", 65, {
    priceIsStartingAt: true,
    description: "Barba completa e acabamento do cabelo (pezinho).",
    duration: 45,
  }),
  service(5, "cabelo_barba", "Cabelo e Barba Completa", 110, {
    priceIsStartingAt: true,
    priceRules: tueWed(100),
    description: "Corte de cabelo com técnicas modernas e avançadas, mais barba completa.",
    duration: 75,
  }),
  service(6, "cabelo_barba_sobrancelha_nariz", "Cabelo, Barba, Sobrancelha e Depilação de Nariz", 130, {
    priceIsStartingAt: true,
    duration: 90,
  }),
  service(7, "cabelo_barba_express", "Cabelo e Barba Express", 80, {
    priceIsStartingAt: true,
    duration: 60,
  }),
  service(8, "barba_maquina", "Barba Completa e Máquina", 80, {
    priceIsStartingAt: true,
    duration: 60,
  }),
  service(9, "barba_express", "Barba Express", 45, {
    priceIsStartingAt: true,
    description: "Barba desenhada e pelos aparados.",
    duration: 20,
  }),
  service(10, "corte_maquina", "Corte à Máquina", 40, {
    description: "Corte realizado apenas com a máquina.",
    duration: 30,
  }),
  service(11, "relaxamento", "Relaxamento Capilar", 30, {
    description: "Tratamento para cabelos crespos ou ondulados.",
    duration: 30,
  }),
  service(12, "corte_cacheado", "Corte de Cabelo Cacheado / Ondulado", 80, {
    priceIsStartingAt: true,
    duration: 60,
  }),
  service(13, "vip", "Atendimento VIP", 165, {
    priceIsStartingAt: true,
    description: "Inclui corte de cabelo e de barba, além de tratamento especial no couro cabeludo.",
    duration: 100,
  }),
  service(14, "hidratacao", "Hidratação", 30, {
    description: "Repõe a umidade natural, os nutrientes e a queratina perdida.",
    duration: 30,
  }),
  service(15, "penteado", "Penteado", 25, {
    description: "Lavamos e deixamos o cabelo estiloso para o seu evento.",
    duration: 30,
  }),
  service(16, "pezinho", "Pezinho", 15, {
    description: "Acabamento do cabelo.",
    duration: 15,
  }),
];

/** Horário de funcionamento publicado no Avec. Domingo fechado. */
function seedHours(): BusinessHour[] {
  const rows: Array<[Weekday, number, number]> = [
    [1, 9 * 60, 20 * 60],
    [2, 9 * 60, 20 * 60],
    [3, 9 * 60, 20 * 60],
    [4, 9 * 60, 20 * 60],
    [5, 8 * 60, 19 * 60],
    [6, 8 * 60, 15 * 60],
  ];
  return rows.map(([weekday, opensMin, closesMin]) => ({
    id: `hour_biz_${weekday}`,
    businessId: BUSINESS_ID,
    professionalId: null,
    weekday,
    opensMin,
    closesMin,
  }));
}

function pro(
  n: number,
  id: string,
  name: string,
  active: boolean,
  source: string,
  externalRating: Professional["externalRating"] = null,
  extra: { photoUrl?: string; bio?: string } = {},
): Professional {
  return {
    id: `pro_${id}`,
    businessId: BUSINESS_ID,
    name,
    photoUrl: extra.photoUrl ?? null,
    // [INFORMAÇÃO NÃO ENCONTRADA] especialidades. Fotos: retratos publicados no Instagram da barbearia.
    bio: extra.bio ?? "",
    specialties: [],
    serviceIds: [],
    active,
    sortOrder: n,
    externalRating,
    source,
  };
}

/**
 * Equipe. Henrique, Zorzin e Leticia constam na página de agendamento (Avec);
 * Pacano, Gustavo, Leticia e Henrique aparecem nos destaques do Instagram.
 * Pacano e Gustavo ficam inativos até a barbearia confirmar quem atende online.
 */
export const SEED_PROFESSIONALS: Professional[] = [
  pro(1, "henrique", "Henrique", true, "Avec e Instagram", { value: 4.9, count: 51, source: "Avec" }, {
    photoUrl: "/fotos/equipe/henrique.webp",
  }),
  // Zorzin = Gustavo Zorzin (@zorzingustavo no Instagram; o destaque "Gustavo" é a mesma pessoa).
  pro(2, "zorzin", "Zorzin", true, "Avec e Instagram", { value: 5, count: 18, source: "Avec" }, {
    photoUrl: "/fotos/equipe/zorzin.webp",
    bio: "Barbeiro e gestor da barbearia.",
  }),
  pro(3, "leticia", "Leticia", true, "Avec e Instagram", null, { photoUrl: "/fotos/equipe/leticia.webp" }),
  pro(4, "pacano", "Pacano", false, "Instagram (destaques) — confirmar se atende online"),
];

/**
 * Fotos publicadas no Instagram oficial da barbearia (@fiodobigodepiracicaba), otimizadas em public/fotos.
 * A primeira também aparece no destaque da página inicial. Editáveis em Painel → Configurações/Galeria.
 * Antes do lançamento: confirmar com a barbearia a autorização de uso (README).
 */
export const SEED_GALLERY: GalleryImage[] = [
  { id: "gal_jaleco", src: "/fotos/galeria/barbeiro-jaleco.webp", alt: "Barbeiro de boina e jaleco do Fio do Bigode dentro da barbearia" },
  { id: "gal_toalha", src: "/fotos/galeria/toalha-quente.webp", alt: "Barbeiro preparando a toalha quente para a barba" },
  { id: "gal_barba", src: "/fotos/galeria/barba-na-cadeira.webp", alt: "Barba sendo feita na cadeira da barbearia" },
  { id: "gal_ambiente", src: "/fotos/galeria/ambiente.webp", alt: "Ambiente da barbearia com as cadeiras e a decoração clássica" },
  { id: "gal_lowfade", src: "/fotos/galeria/low-fade.webp", alt: "Corte low fade" },
  { id: "gal_burstfade", src: "/fotos/galeria/burst-fade.webp", alt: "Corte burst fade" },
  { id: "gal_mullet", src: "/fotos/galeria/mullet.webp", alt: "Corte mullet" },
  { id: "gal_taperfade", src: "/fotos/galeria/taper-fade.webp", alt: "Corte taper fade" },
  { id: "gal_jitfade", src: "/fotos/galeria/jit-fade.webp", alt: "Corte jit fade em cabelo cacheado" },
  { id: "gal_buzzcut", src: "/fotos/galeria/buzz-cut.webp", alt: "Corte buzz cut" },
  { id: "gal_balm", src: "/fotos/galeria/balm-barba.webp", alt: "Shampoo e balm para barba vendidos na barbearia" },
  { id: "gal_pomada", src: "/fotos/galeria/pomada.webp", alt: "Pomada modeladora vendida na barbearia" },
];

/** Avaliações públicas com texto, coletadas do Avec (autor abreviado). */
export const SEED_REVIEWS: PublicReview[] = [
  ["Thell B.", "2026-07-21", "Muito top"],
  ["Guilherme C.", "2026-02-18", "Excelente atendimento"],
  [
    "William S.",
    "2025-10-16",
    "Henrique sempre com atendimento excelente, ótimo profissional. O ambiente da barbearia é excepcional!",
  ],
  ["Thiago V.", "2025-09-15", "Atendimento e profissionais de qualidade."],
  ["Rafael M.", "2025-09-04", "Atendimento e serviço top! Recomendo!"],
  ["Rafael V.", "2025-09-03", "Atendimento excelente"],
  ["Thomas B.", "2025-03-06", "Atendimento impecável sempre"],
].map(([authorName, date, text], i) => ({
  id: `review_${i + 1}`,
  authorName,
  rating: null,
  text,
  date,
  source: "Avec",
  sourceUrl: AVEC_URL,
  published: true,
}));

/**
 * Níveis iniciais EDITÁVEIS. Nomes e limites são apenas um ponto de partida:
 * a barbearia ainda não definiu benefícios comerciais.
 */
function seedLevels(): LoyaltyLevel[] {
  const base = (
    id: string,
    name: string,
    minPoints: number,
    isVip = false,
  ): LoyaltyLevel => ({
    id: `lvl_${id}`,
    businessId: BUSINESS_ID,
    name,
    minPoints,
    discountPercent: null,
    benefits: "",
    isVip,
  });
  return [
    base("bronze", "Bronze", 0),
    base("prata", "Prata", 300),
    base("ouro", "Ouro", 800),
    base("vip", "VIP", 1500, true),
  ];
}

export function createSeedState(): DataState {
  return {
    version: DATA_VERSION,
    business: {
      id: BUSINESS_ID,
      slug: "fio-do-bigode",
      name: "Fio do Bigode",
      legalTagline: "A mais clássica de Piracicaba",
      description:
        "Fio do Bigode remete à confiança e, com esse propósito, a barbearia conseguiu mesclar o tradicional e o moderno. Somos um local diferenciado não só pelo conforto e atendimento personalizado, mas por oferecer um costume antigo, que não se perdeu mesmo com a chegada da tecnologia e com os dias corridos da sociedade atual. Barba feita com toalha quente, produtos de qualidade e acabamento impecável como você merece. Cortes de cabelo tradicionais e modernos. Contamos em nosso espaço com uma loja, serviço de bar e linha exclusiva de produtos. Venha nos visitar.",
      address: {
        street: "Rua Barão de Piracicamirim, 782",
        neighborhood: "São Dimas",
        city: "Piracicaba",
        state: "SP",
        zip: "13416-005",
      },
      whatsappE164: "5519998647135",
      whatsappDisplay: "(19) 99864-7135",
      instagram: { handle: "fiodobigodepiracicaba", url: INSTAGRAM_URL },
      rating: { value: 5, count: 97, source: "Avec", url: AVEC_URL },
    },
    settings: {
      businessId: BUSINESS_ID,
      minNoticeMinutes: 60,
      bookingWindowDays: 30,
      slotIntervalMinutes: 30,
      customerChangeLimitHours: 2,
      autoConfirm: true,
      loyalty: {
        enabled: true,
        model: "points",
        pointsPerReal: 1,
        pointsPerVisit: 0,
        rounding: "floor",
        pointsValidityDays: null,
        visitsGoal: 10,
        visitsRewardId: null,
        birthdayBonusPoints: 0,
        referral: { enabled: false, referrerPoints: 0, refereePoints: 0, monthlyLimit: 5 },
      },
      retention: {
        inactiveDays: [30, 60, 90],
        recurringMinVisits: 3,
        newCustomerDays: 30,
        birthdayLookaheadDays: 30,
      },
    },
    professionals: SEED_PROFESSIONALS,
    services: SEED_SERVICES,
    hours: seedHours(),
    blocks: [],
    customers: [],
    customerNotes: [],
    appointments: [],
    statusHistory: [],
    ledger: [],
    levels: seedLevels(),
    rewards: [],
    customerRewards: [],
    referrals: [],
    referralEvents: [],
    campaigns: [],
    reviews: SEED_REVIEWS,
    gallery: SEED_GALLERY.map((g) => ({ ...g })),
  };
}

/** Agrupamento apenas de EXIBIÇÃO (organização nossa; os serviços em si são reais). */
export const SERVICE_GROUPS = [
  { key: "cabelo", label: "Cabelo", ids: ["svc_corte", "svc_corte_sobrancelha", "svc_corte_maquina", "svc_corte_cacheado", "svc_penteado", "svc_pezinho"] },
  { key: "barba", label: "Barba", ids: ["svc_barba", "svc_barba_pezinho", "svc_barba_express"] },
  { key: "combos", label: "Cabelo e barba", ids: ["svc_cabelo_barba", "svc_cabelo_barba_express", "svc_barba_maquina", "svc_cabelo_barba_sobrancelha_nariz", "svc_vip"] },
  { key: "tratamentos", label: "Tratamentos", ids: ["svc_hidratacao", "svc_relaxamento"] },
] as const;

export const INSTAGRAM_HIGHLIGHTS = [
  "Pacano",
  "Gustavo",
  "Leticia",
  "Henrique",
  "A Barbearia",
  "Brejas Artesanal",
] as const;
