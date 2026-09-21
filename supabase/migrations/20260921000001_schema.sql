-- =============================================================================
-- Fio do Bigode Barbearia — esquema do banco (PostgreSQL / Supabase)
--
-- STATUS: PREPARADO, NÃO APLICADO. Não foi executado em nenhum projeto Supabase.
-- Testado apenas em PostgreSQL 16 local (ver supabase/tests e docs/DATABASE.md).
-- Aplicar somente após a aprovação do cliente e com autorização explícita.
--
-- Multi-tenant: toda tabela de negócio carrega business_id e é protegida por RLS
-- (arquivo 0002). Os nomes espelham src/types/index.ts.
-- =============================================================================

create schema if not exists extensions;     -- já existe no Supabase; criado para bancos locais
create extension if not exists btree_gist with schema extensions;  -- exclusion constraint (double booking)
create extension if not exists pgcrypto with schema extensions;    -- digest(), gen_random_bytes()

-- Schema privado: funções auxiliares que NÃO devem ser expostas pela API.
create schema if not exists app;

create type public.member_role as enum ('owner', 'admin', 'staff');
create type public.appointment_status as enum ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
create type public.loyalty_tx_type as enum ('EARN', 'REDEEM', 'ADJUSTMENT', 'EXPIRE', 'BONUS');
create type public.reward_kind as enum ('discount', 'free_service', 'upgrade', 'other');
create type public.customer_reward_status as enum ('available', 'used', 'expired', 'cancelled');
create type public.referral_status as enum ('registered', 'qualified', 'rejected');
create type public.campaign_kind as enum ('points_multiplier', 'bonus_points', 'message');
create type public.block_kind as enum ('block', 'vacation', 'holiday', 'maintenance');

-- ---------------------------------------------------------------------------
-- Barbearia (tenant) e equipe do painel
-- ---------------------------------------------------------------------------
create table public.businesses (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name          text not null,
  description   text not null default '',
  street        text not null default '',
  neighborhood  text not null default '',
  city          text not null default '',
  state         char(2) not null default 'SP',
  zip           text not null default '',
  whatsapp_e164 text not null check (whatsapp_e164 ~ '^55[0-9]{10,11}$'),
  instagram_handle text,
  instagram_url    text,
  timezone      text not null default 'America/Sao_Paulo',
  created_at    timestamptz not null default now()
);

-- Quem pode operar o painel de cada barbearia (vinculado ao Supabase Auth).
create table public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.member_role not null default 'staff',
  created_at  timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index business_members_user_idx on public.business_members (user_id);

create table public.business_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  min_notice_minutes          int  not null default 60  check (min_notice_minutes >= 0),
  booking_window_days         int  not null default 30  check (booking_window_days between 1 and 365),
  slot_interval_minutes       int  not null default 30  check (slot_interval_minutes between 5 and 120),
  customer_change_limit_hours int  not null default 2   check (customer_change_limit_hours >= 0),
  auto_confirm                boolean not null default true,
  -- Regras editáveis pela barbearia (mesma estrutura de BusinessSettings.loyalty / .retention):
  loyalty  jsonb not null default '{
    "enabled": true, "model": "points", "pointsPerReal": 1, "pointsPerVisit": 0,
    "rounding": "floor", "pointsValidityDays": null, "visitsGoal": 10, "visitsRewardId": null,
    "birthdayBonusPoints": 0,
    "referral": {"enabled": false, "referrerPoints": 0, "refereePoints": 0, "monthlyLimit": 0}
  }'::jsonb,
  retention jsonb not null default '{
    "inactiveDays": [30, 60, 90], "recurringMinVisits": 3, "newCustomerDays": 30, "birthdayLookaheadDays": 7
  }'::jsonb,
  message_templates jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
create table public.professionals (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null check (length(name) between 2 and 60),
  photo_path  text,                       -- caminho no Storage (bucket público "site")
  bio         text not null default '',
  specialties text[] not null default '{}',
  active      boolean not null default true,
  sort_order  int not null default 0,
  external_rating jsonb,                  -- {value,count,source} quando informado
  source      text not null default '',   -- origem da informação (auditoria)
  created_at  timestamptz not null default now(),
  unique (business_id, id)
);
create index professionals_business_idx on public.professionals (business_id, active, sort_order);

create table public.services (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null check (length(name) between 2 and 80),
  description text not null default '',
  price_cents int check (price_cents is null or price_cents >= 0),  -- null = "Consultar"
  price_is_starting_at boolean not null default false,
  -- [{"weekdays":[2,3],"priceCents":3000,"label":"Promoção de terça e quarta"}]
  price_rules jsonb not null default '[]'::jsonb,
  duration_minutes int not null check (duration_minutes between 5 and 480),
  duration_confirmed boolean not null default false,
  points_bonus int not null default 0 check (points_bonus >= 0),
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (business_id, id)
);
create index services_business_idx on public.services (business_id, active, sort_order);

-- Sem linhas para um profissional = realiza TODOS os serviços (igual ao front).
create table public.professional_services (
  business_id     uuid not null,
  professional_id uuid not null,
  service_id      uuid not null,
  primary key (professional_id, service_id),
  foreign key (business_id, professional_id) references public.professionals (business_id, id) on delete cascade,
  foreign key (business_id, service_id)      references public.services (business_id, id) on delete cascade
);

-- Expediente. professional_id nulo = horário da barbearia. Várias janelas por dia = intervalo.
create table public.business_hours (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  professional_id uuid,
  weekday     smallint not null check (weekday between 0 and 6),   -- 0 = domingo
  opens_min   smallint not null check (opens_min between 0 and 1439),
  closes_min  smallint not null check (closes_min between 1 and 1440),
  check (closes_min > opens_min),
  foreign key (business_id, professional_id) references public.professionals (business_id, id) on delete cascade
);
create index business_hours_lookup_idx on public.business_hours (business_id, professional_id, weekday);

create table public.blocked_periods (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  professional_id uuid,                                -- nulo = toda a barbearia
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  kind        public.block_kind not null default 'block',
  reason      text not null default '',
  check (ends_at > starts_at),
  foreign key (business_id, professional_id) references public.professionals (business_id, id) on delete cascade
);
create index blocked_periods_lookup_idx on public.blocked_periods (business_id, starts_at, ends_at);

-- ---------------------------------------------------------------------------
-- Clientes (CRM)
-- ---------------------------------------------------------------------------
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,   -- login do cliente (OTP)
  name        text not null check (length(name) between 2 and 80),
  whatsapp    text not null check (whatsapp ~ '^55[0-9]{10,11}$'),
  email       text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  birth_date  date check (birth_date is null or birth_date between date '1900-01-01' and current_date),
  referral_code text not null,
  referred_by_customer_id uuid,
  lgpd_consent_at timestamptz,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, whatsapp),
  unique (business_id, referral_code),
  foreign key (business_id, referred_by_customer_id) references public.customers (business_id, id) on delete set null (referred_by_customer_id)
);
create index customers_auth_idx on public.customers (auth_user_id) where auth_user_id is not null;
create index customers_business_created_idx on public.customers (business_id, created_at desc);

-- Observações INTERNAS: nunca expostas ao cliente (RLS só para equipe).
create table public.customer_notes (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  customer_id uuid not null,
  body        text not null check (length(body) between 1 and 1000),
  author_id   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  foreign key (business_id, customer_id) references public.customers (business_id, id) on delete cascade
);
create index customer_notes_customer_idx on public.customer_notes (customer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Agendamentos
-- ---------------------------------------------------------------------------
create table public.appointments (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  customer_id uuid not null,
  professional_id uuid not null,
  service_id  uuid not null,
  service_name text not null,                 -- foto do serviço no momento da reserva
  duration_minutes int not null check (duration_minutes between 5 and 480),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  status      public.appointment_status not null default 'pending',
  price_cents int check (price_cents is null or price_cents >= 0),   -- calculado no servidor
  price_is_starting_at boolean not null default false,
  final_price_cents int check (final_price_cents is null or final_price_cents >= 0),
  customer_notes text not null default '' check (length(customer_notes) <= 300),
  manage_token_hash text not null,            -- sha256 do token do link; o token em si não é guardado
  source      text not null default 'site' check (source in ('site', 'admin')),
  created_at  timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  rescheduled_from_starts_at timestamptz,
  points_awarded int not null default 0,
  check (ends_at > starts_at),
  foreign key (business_id, customer_id)     references public.customers (business_id, id) on delete cascade,
  foreign key (business_id, professional_id) references public.professionals (business_id, id),
  foreign key (business_id, service_id)      references public.services (business_id, id),
  -- A GARANTIA FINAL contra double booking, mesmo com requisições simultâneas:
  -- o mesmo profissional não pode ter dois horários ativos que se sobreponham.
  constraint appointments_no_overlap exclude using gist (
    business_id with =,
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed', 'completed'))
);
create unique index appointments_token_idx on public.appointments (manage_token_hash);
create index appointments_agenda_idx on public.appointments (business_id, starts_at);
create index appointments_customer_idx on public.appointments (customer_id, starts_at desc);
create index appointments_pro_idx on public.appointments (professional_id, starts_at);

create table public.appointment_status_history (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  from_status public.appointment_status,
  to_status   public.appointment_status not null,
  actor       text not null check (actor in ('customer', 'admin', 'system')),
  note        text not null default '',
  created_at  timestamptz not null default now()
);
create index appointment_history_idx on public.appointment_status_history (appointment_id, created_at);

-- ---------------------------------------------------------------------------
-- Fidelidade
-- ---------------------------------------------------------------------------
-- Ledger APPEND-ONLY (trigger no arquivo 0002 bloqueia UPDATE/DELETE).
-- O saldo é sempre a soma de `amount`; nunca um número solto.
create table public.loyalty_transactions (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  customer_id uuid not null,
  type        public.loyalty_tx_type not null,
  amount      int not null check (amount <> 0),
  description text not null default '',
  reference_type text,
  reference_id   text,
  expires_at  timestamptz,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  foreign key (business_id, customer_id) references public.customers (business_id, id) on delete cascade,
  -- sinais coerentes com o tipo
  check ((type in ('EARN', 'BONUS') and amount > 0) or (type in ('REDEEM', 'EXPIRE') and amount < 0) or type = 'ADJUSTMENT')
);
create index loyalty_tx_customer_idx on public.loyalty_transactions (customer_id, created_at desc);
-- Idempotência: um atendimento só gera pontos uma vez; bônus de aniversário/indicação idem.
create unique index loyalty_tx_idempotent_idx
  on public.loyalty_transactions (business_id, type, reference_type, reference_id)
  where type in ('EARN', 'BONUS', 'EXPIRE') and reference_type is not null and reference_id is not null;

create table public.loyalty_levels (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  min_points  int not null check (min_points >= 0),
  discount_percent numeric(5,2) check (discount_percent is null or discount_percent between 0 and 100),
  benefits    text not null default '',
  is_vip      boolean not null default false,
  unique (business_id, min_points)
);

create table public.loyalty_rewards (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  name        text not null,
  description text not null default '',
  kind        public.reward_kind not null default 'other',
  cost_points int not null check (cost_points >= 0),
  validity_days int check (validity_days is null or validity_days > 0),
  stock       int check (stock is null or stock >= 0),
  active      boolean not null default true,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  foreign key (business_id) references public.businesses(id) on delete cascade,
  unique (business_id, id)
);

create table public.customer_rewards (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  customer_id uuid not null,
  reward_id   uuid,
  reward_name text not null,
  code        text not null,                 -- FDB-XXXX-XXXX (pronto para QR Code)
  status      public.customer_reward_status not null default 'available',
  points_spent int not null default 0,
  source      text not null default 'points' check (source in ('points', 'visits', 'birthday', 'campaign', 'admin')),
  expires_at  timestamptz,
  used_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (business_id, code),
  foreign key (business_id, customer_id) references public.customers (business_id, id) on delete cascade,
  foreign key (business_id, reward_id) references public.loyalty_rewards (business_id, id) on delete set null (reward_id)
);
create index customer_rewards_customer_idx on public.customer_rewards (customer_id, created_at desc);

create table public.referrals (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  referrer_id uuid not null,
  referee_id  uuid not null,
  status      public.referral_status not null default 'registered',
  created_at  timestamptz not null default now(),
  foreign key (business_id, referrer_id) references public.customers (business_id, id) on delete cascade,
  foreign key (business_id, referee_id)  references public.customers (business_id, id) on delete cascade,
  check (referrer_id <> referee_id),          -- ninguém indica a si mesmo
  unique (business_id, referee_id)            -- cada cliente só pode ser indicado uma vez
);

create table public.referral_events (
  id          uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals(id) on delete cascade,
  type        public.referral_status not null,
  points      int not null default 0,
  note        text not null default '',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Campanhas, mensagens e conteúdo do site
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  kind        public.campaign_kind not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  multiplier  numeric(4,2) check (multiplier is null or multiplier > 1),
  bonus_points int check (bonus_points is null or bonus_points > 0),
  segment     text not null default 'all',
  message_template text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);

-- Quem já foi marcado como "mensagem enviada" (envio é manual via wa.me).
create table public.campaign_recipients (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  sent_at     timestamptz not null default now(),
  primary key (campaign_id, customer_id)
);

-- Fila para a FUTURA automação de lembretes (WhatsApp Business API / e-mail).
-- Hoje ninguém consome esta tabela: os lembretes são enviados manualmente pelo painel.
create table public.message_outbox (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  template_key text not null,
  channel     text not null default 'whatsapp' check (channel in ('whatsapp', 'email')),
  scheduled_for timestamptz not null,
  status      text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  provider_message_id text,
  error       text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index message_outbox_due_idx on public.message_outbox (status, scheduled_for) where status = 'pending';

create table public.public_reviews (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  author_name text not null,
  rating      numeric(2,1) check (rating is null or rating between 1 and 5),
  body        text not null,
  reviewed_on date,
  source      text not null default '',
  source_url  text,
  published   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.gallery_images (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  storage_path text not null,
  alt         text not null default '',
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- Trilha de auditoria de ações sensíveis (ajuste de pontos, exclusões, mudanças de status).
create table public.audit_log (
  id          bigint generated always as identity primary key,
  business_id uuid references public.businesses(id) on delete cascade,
  actor_id    uuid,
  action      text not null,
  entity      text not null,
  entity_id   text,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_business_idx on public.audit_log (business_id, created_at desc);
