-- =============================================================================
-- Fio do Bigode Barbearia — agendamento (RPCs)
--
-- STATUS: PREPARADO, NÃO APLICADO (ver 0001).
--
-- Espelha src/domain/availability.ts e src/services/booking.ts. No servidor NADA vindo do
-- navegador é confiável: preço, duração, profissional elegível e disponibilidade são sempre
-- recalculados aqui. A garantia final contra double booking é a exclusion constraint
-- `appointments_no_overlap`; a verificação em `slot_rejection` só dá mensagens melhores.
--
-- Erros de negócio: message = texto para o usuário (pt-BR), detail = código (SLOT_UNAVAILABLE,
-- VALIDATION, FORBIDDEN, TOO_LATE, INVALID_STATUS, NOT_FOUND, CUSTOMER_OVERLAP, ...).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------
create or replace function app.fail(p_code text, p_message text)
returns void
language plpgsql
as $$
begin
  raise exception '%', p_message using errcode = 'P0001', detail = p_code;
end;
$$;

create or replace function app.tz(p_business uuid)
returns text
language sql stable
set search_path = ''
as $$
  select coalesce((select b.timezone from public.businesses b where b.id = p_business), 'America/Sao_Paulo');
$$;

create or replace function app.local_date(p_ts timestamptz, p_tz text)
returns date language sql stable set search_path = ''
as $$ select (p_ts at time zone p_tz)::date $$;

create or replace function app.local_minutes(p_ts timestamptz, p_tz text)
returns int language sql stable set search_path = ''
as $$ select (extract(hour from (p_ts at time zone p_tz)) * 60 + extract(minute from (p_ts at time zone p_tz)))::int $$;

/** Mesma regra de src/domain/whatsapp.ts#normalizeWhatsApp. Devolve null se inválido. */
create or replace function app.normalize_whatsapp(p_input text)
returns text
language plpgsql immutable
set search_path = ''
as $$
declare d text := regexp_replace(coalesce(p_input, ''), '\D', '', 'g'); ddd int;
begin
  if d like '00%' then d := substr(d, 3); end if;
  if length(d) in (10, 11) then d := '55' || d; end if;
  if d !~ '^55[0-9]{10,11}$' then return null; end if;
  ddd := substr(d, 3, 2)::int;
  if ddd < 11 or ddd > 99 then return null; end if;
  if length(substr(d, 5)) = 9 and substr(d, 5, 1) <> '9' then return null; end if;
  return d;
end;
$$;

/** Preço efetivo do serviço no dia da semana (regras por dia > preço base). */
create or replace function app.price_for(p_service public.services, p_weekday int)
returns int
language sql immutable
set search_path = ''
as $$
  select coalesce(
    (select (r ->> 'priceCents')::int
       from jsonb_array_elements(p_service.price_rules) r
      where (r -> 'weekdays') @> to_jsonb(p_weekday)
      limit 1),
    p_service.price_cents
  );
$$;

/** Código de indicação legível (primeiro nome + 3 dígitos), único por barbearia. */
create or replace function app.gen_referral_code(p_business uuid, p_name text)
returns text
language plpgsql
set search_path = ''
as $$
declare base text; code text; i int := 0;
begin
  base := upper(left(regexp_replace(
            translate(lower(split_part(btrim(p_name), ' ', 1)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
            '[^a-z]', '', 'g'), 8));
  if base = '' then base := 'CLIENTE'; end if;
  loop
    i := i + 1;
    code := base || (100 + floor(random() * 900))::int;
    exit when not exists (select 1 from public.customers c where c.business_id = p_business and c.referral_code = code);
    if i >= 50 then
      code := base || upper(encode(extensions.gen_random_bytes(3), 'hex'));
      exit;
    end if;
  end loop;
  return code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Disponibilidade (fonte única — espelha evaluateSlot)
-- ---------------------------------------------------------------------------
create or replace function app.slot_rejection(
  p_business uuid,
  p_professional uuid,
  p_service uuid,
  p_starts timestamptz,
  p_ignore_notice boolean default false,
  p_require_grid boolean default true,
  p_exclude_appointment uuid default null
)
returns text
language plpgsql stable
set search_path = ''
as $$
declare
  s        public.business_settings;
  tz       text := app.tz(p_business);
  dur      int;
  loc_date date := app.local_date(p_starts, tz);
  loc_min  int  := app.local_minutes(p_starts, tz);
  wd       int  := extract(dow from app.local_date(p_starts, tz))::int;
  has_own  boolean;
  win      public.business_hours;
  span     tstzrange;
begin
  select * into s from public.business_settings where business_id = p_business;
  select duration_minutes into dur from public.services where id = p_service and business_id = p_business;
  if s.business_id is null or dur is null then return 'not_offered'; end if;
  span := tstzrange(p_starts, p_starts + make_interval(mins => dur), '[)');

  -- Profissional sem linhas em professional_services faz TODOS os serviços.
  if exists (select 1 from public.professional_services ps where ps.professional_id = p_professional)
     and not exists (select 1 from public.professional_services ps
                      where ps.professional_id = p_professional and ps.service_id = p_service) then
    return 'not_offered';
  end if;

  if not p_ignore_notice then
    if p_starts < now() then return 'past'; end if;
    if p_starts < now() + make_interval(mins => s.min_notice_minutes) then return 'too_soon'; end if;
    if loc_date - app.local_date(now(), tz) > s.booking_window_days then return 'too_far'; end if;
  end if;

  -- Expediente do profissional; se não tiver horário próprio, vale o da barbearia.
  select exists (select 1 from public.business_hours h
                  where h.business_id = p_business and h.professional_id = p_professional)
    into has_own;
  select h.* into win
    from public.business_hours h
   where h.business_id = p_business
     and h.weekday = wd
     and ((has_own and h.professional_id = p_professional) or (not has_own and h.professional_id is null))
     and loc_min >= h.opens_min and loc_min + dur <= h.closes_min
   order by h.opens_min
   limit 1;
  if win.id is null then return 'outside_hours'; end if;

  if p_require_grid and (loc_min - win.opens_min) % s.slot_interval_minutes <> 0 then
    return 'off_grid';
  end if;

  if exists (select 1 from public.blocked_periods b
              where b.business_id = p_business
                and (b.professional_id is null or b.professional_id = p_professional)
                and tstzrange(b.starts_at, b.ends_at, '[)') && span) then
    return 'blocked';
  end if;

  if exists (select 1 from public.appointments a
              where a.business_id = p_business
                and a.professional_id = p_professional
                and (p_exclude_appointment is null or a.id <> p_exclude_appointment)
                and a.status in ('pending', 'confirmed', 'completed')
                and tstzrange(a.starts_at, a.ends_at, '[)') && span) then
    return 'conflict';
  end if;

  return null;
end;
$$;

create or replace function app.rejection_message(p_reason text)
returns text
language sql immutable
set search_path = ''
as $$
  select case p_reason
    when 'past' then 'Esse horário já passou.'
    when 'too_soon' then 'Esse horário exige mais antecedência para agendar.'
    when 'too_far' then 'Ainda não abrimos a agenda para essa data.'
    when 'not_offered' then 'Esse profissional não realiza o serviço escolhido.'
    when 'outside_hours' then 'Esse horário está fora do expediente.'
    when 'blocked' then 'Esse horário está bloqueado na agenda.'
    when 'conflict' then 'Esse horário acabou de ser ocupado. Escolha outro.'
    else 'Horário inválido para a agenda.'
  end;
$$;

/** Calcula os horários livres de um dia. p_first_only: para no primeiro (usado por available_days). */
create or replace function app.compute_slots(
  p_business uuid, p_service uuid, p_date date, p_professional uuid, p_first_only boolean
)
returns table (professional_id uuid, starts_at timestamptz, ends_at timestamptz, start_min int)
language plpgsql stable
set search_path = ''
as $$
declare
  tz   text := app.tz(p_business);
  step int;
  dur  int;
  pro  record;
  win  record;
  m    int;
  ts   timestamptz;
  has_own boolean;
begin
  select slot_interval_minutes into step from public.business_settings where business_id = p_business;
  select duration_minutes into dur from public.services
   where id = p_service and business_id = p_business and active;
  if step is null or dur is null then return; end if;

  for pro in
    select p.id from public.professionals p
     where p.business_id = p_business and p.active
       and (p_professional is null or p.id = p_professional)
     order by p.sort_order, p.id
  loop
    select exists (select 1 from public.business_hours h
                    where h.business_id = p_business and h.professional_id = pro.id) into has_own;
    for win in
      select h.opens_min, h.closes_min from public.business_hours h
       where h.business_id = p_business and h.weekday = extract(dow from p_date)::int
         and ((has_own and h.professional_id = pro.id) or (not has_own and h.professional_id is null))
       order by h.opens_min
    loop
      m := win.opens_min;
      while m + dur <= win.closes_min loop
        -- meia-noite local do dia + m minutos (correto mesmo em mudança de horário de verão)
        ts := ((p_date::timestamp + make_interval(mins => m)) at time zone tz);
        if app.slot_rejection(p_business, pro.id, p_service, ts, false, true, null) is null then
          professional_id := pro.id; starts_at := ts;
          ends_at := ts + make_interval(mins => dur); start_min := m;
          return next;
          if p_first_only then return; end if;
        end if;
        m := m + step;
      end loop;
    end loop;
  end loop;
end;
$$;

/** Horários livres de um dia (público). Não expõe nenhum dado de cliente. */
create or replace function public.available_slots(
  p_business uuid,
  p_service uuid,
  p_date date,
  p_professional uuid default null
)
returns table (professional_id uuid, starts_at timestamptz, ends_at timestamptz, start_min int)
language sql stable security definer
set search_path = ''
as $$
  select * from app.compute_slots(p_business, p_service, p_date, p_professional, false)
  order by start_min, professional_id;
$$;

/** Dias com ao menos um horário livre (para o calendário do site). */
create or replace function public.available_days(
  p_business uuid,
  p_service uuid,
  p_from date,
  p_days int,
  p_professional uuid default null
)
returns table (day date, has_slots boolean)
language plpgsql stable security definer
set search_path = ''
as $$
declare i int;
begin
  if p_days < 1 or p_days > 120 then perform app.fail('VALIDATION', 'Intervalo inválido.'); end if;
  for i in 0 .. p_days - 1 loop
    day := p_from + i;
    has_slots := exists (select 1 from app.compute_slots(p_business, p_service, day, p_professional, true));
    return next;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Núcleo de reserva (interno). Recebe o cliente já resolvido.
-- ---------------------------------------------------------------------------
create or replace function app.status_log(
  p_business uuid, p_appointment uuid, p_from public.appointment_status,
  p_to public.appointment_status, p_actor text, p_note text
) returns void
language sql
set search_path = ''
as $$
  insert into public.appointment_status_history (business_id, appointment_id, from_status, to_status, actor, note)
  values (p_business, p_appointment, p_from, p_to, p_actor, p_note);
$$;

/**
 * Escolhe/valida o profissional e insere o agendamento.
 * p_professional nulo = "qualquer": tenta os livres do menos ao mais ocupado no dia;
 * se uma corrida (outra reserva simultânea) estourar a constraint, tenta o próximo.
 * Devolve (appointment_id, professional_id, manage_token em texto puro — só aqui).
 */
create or replace function app.insert_booking(
  p_business uuid, p_customer uuid, p_service uuid, p_professional uuid,
  p_starts timestamptz, p_notes text, p_source text
)
returns table (appointment_id uuid, professional_id uuid, manage_token text, status public.appointment_status)
language plpgsql
set search_path = ''
as $$
declare
  svc public.services;
  st  public.business_settings;
  tz  text := app.tz(p_business);
  admin boolean := (p_source = 'admin');
  cand record;
  reason text;
  new_status public.appointment_status;
  token text;
  price int;
  wd int;
  new_id uuid;
  tried boolean := false;
begin
  select * into svc from public.services where id = p_service and business_id = p_business and active;
  if svc.id is null then perform app.fail('NOT_FOUND', 'Serviço indisponível.'); end if;
  select * into st from public.business_settings where business_id = p_business;
  new_status := case when admin or st.auto_confirm then 'confirmed' else 'pending' end;
  wd := extract(dow from app.local_date(p_starts, tz))::int;
  price := app.price_for(svc, wd);

  -- Um cliente não pode ter dois horários simultâneos (serializa por cliente).
  perform pg_advisory_xact_lock(hashtextextended(p_customer::text, 0));
  if exists (select 1 from public.appointments a
              where a.customer_id = p_customer and a.status in ('pending', 'confirmed')
                and tstzrange(a.starts_at, a.ends_at, '[)')
                    && tstzrange(p_starts, p_starts + make_interval(mins => svc.duration_minutes), '[)')) then
    perform app.fail('CUSTOMER_OVERLAP', 'Você já tem um horário marcado nesse período.');
  end if;

  for cand in
    select p.id
      from public.professionals p
     where p.business_id = p_business and p.active
       and (p_professional is null or p.id = p_professional)
     order by
       (select count(*) from public.appointments a
         where a.professional_id = p.id and a.status in ('pending', 'confirmed', 'completed')
           and app.local_date(a.starts_at, tz) = app.local_date(p_starts, tz)),
       p.sort_order, p.id
  loop
    reason := app.slot_rejection(p_business, cand.id, p_service, p_starts, admin, not admin, null);
    if reason is not null then
      -- Profissional escolhido explicitamente: informa o motivo real.
      if p_professional is not null then perform app.fail('SLOT_UNAVAILABLE', app.rejection_message(reason)); end if;
      continue;
    end if;
    tried := true;
    token := encode(extensions.gen_random_bytes(24), 'hex');
    begin
      insert into public.appointments (
        business_id, customer_id, professional_id, service_id, service_name, duration_minutes,
        starts_at, ends_at, status, price_cents, price_is_starting_at, customer_notes,
        manage_token_hash, source
      ) values (
        p_business, p_customer, cand.id, svc.id, svc.name, svc.duration_minutes,
        p_starts, p_starts + make_interval(mins => svc.duration_minutes), new_status,
        price, svc.price_is_starting_at and price is not distinct from svc.price_cents,
        coalesce(left(p_notes, 300), ''),
        encode(extensions.digest(token, 'sha256'), 'hex'), p_source
      ) returning id into new_id;
      perform app.status_log(p_business, new_id, null, new_status,
                             case when admin then 'admin' else 'customer' end, 'Agendamento criado');
      appointment_id := new_id; professional_id := cand.id; manage_token := token; status := new_status;
      return next;
      return;
    exception when exclusion_violation then
      -- Outra reserva simultânea ocupou este profissional; tenta o próximo (se "qualquer").
      if p_professional is not null then perform app.fail('SLOT_UNAVAILABLE', app.rejection_message('conflict')); end if;
    end;
  end loop;

  if p_professional is not null and not tried then
    perform app.fail('NOT_FOUND', 'Profissional indisponível.');
  end if;
  perform app.fail('SLOT_UNAVAILABLE', app.rejection_message('conflict'));
end;
$$;

-- ---------------------------------------------------------------------------
-- Agendar pelo site (anon ou logado)
-- ---------------------------------------------------------------------------
create or replace function public.create_booking(
  p_business uuid,
  p_service uuid,
  p_professional uuid,          -- nulo = qualquer profissional
  p_starts_at timestamptz,
  p_name text,
  p_whatsapp text,
  p_email text default null,
  p_birth_date date default null,
  p_notes text default '',
  p_referral_code text default null
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  wa text := app.normalize_whatsapp(p_whatsapp);
  nm text := btrim(coalesce(p_name, ''));
  cust public.customers;
  is_new boolean := false;
  referrer public.customers;
  st public.business_settings;
  b record;
  active_count int;
begin
  if not exists (select 1 from public.businesses where id = p_business) then
    perform app.fail('NOT_FOUND', 'Barbearia não encontrada.');
  end if;
  if length(nm) < 2 or length(nm) > 80 then perform app.fail('VALIDATION', 'Informe seu nome.'); end if;
  if wa is null then perform app.fail('VALIDATION', 'WhatsApp inválido. Use DDD + número.'); end if;
  if p_email is not null and p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform app.fail('VALIDATION', 'E-mail inválido.');
  end if;
  if p_birth_date is not null and (p_birth_date > current_date or p_birth_date < date '1900-01-01') then
    perform app.fail('VALIDATION', 'Data de nascimento inválida.');
  end if;

  select * into cust from public.customers where business_id = p_business and whatsapp = wa;
  if cust.id is null then
    insert into public.customers (business_id, name, whatsapp, email, birth_date, referral_code, lgpd_consent_at)
    values (p_business, nm, wa, nullif(btrim(coalesce(p_email, '')), ''), p_birth_date,
            app.gen_referral_code(p_business, nm), now())
    on conflict (business_id, whatsapp) do nothing
    returning * into cust;
    if cust.id is not null then is_new := true; end if;
    if cust.id is null then  -- corrida: outro request criou primeiro
      select * into cust from public.customers where business_id = p_business and whatsapp = wa;
    end if;
  else
    update public.customers
       set email = coalesce(email, nullif(btrim(coalesce(p_email, '')), '')),
           birth_date = coalesce(birth_date, p_birth_date)
     where id = cust.id
     returning * into cust;
  end if;

  -- Freio simples contra abuso: no máximo 5 horários futuros ativos por cliente.
  -- (Rate limit por IP/CAPTCHA ficam na borda — ver docs/DATABASE.md, PENDENTE.)
  select count(*) into active_count from public.appointments a
   where a.customer_id = cust.id and a.status in ('pending', 'confirmed') and a.starts_at > now();
  if active_count >= 5 then
    perform app.fail('LIMIT', 'Você já tem muitos horários futuros. Fale com a barbearia pelo WhatsApp.');
  end if;

  select * into b from app.insert_booking(p_business, cust.id, p_service, p_professional, p_starts_at, p_notes, 'site');

  -- Indicação: só registra para cliente NOVO, com código válido e programa ligado.
  if is_new and p_referral_code is not null then
    select * into st from public.business_settings where business_id = p_business;
    if coalesce((st.loyalty -> 'referral' ->> 'enabled')::boolean, false) then
      select * into referrer from public.customers
       where business_id = p_business and referral_code = upper(btrim(p_referral_code)) and id <> cust.id;
      if referrer.id is not null then
        update public.customers set referred_by_customer_id = referrer.id where id = cust.id;
        with r as (
          insert into public.referrals (business_id, referrer_id, referee_id)
          values (p_business, referrer.id, cust.id) returning id
        )
        insert into public.referral_events (referral_id, type, note)
        select r.id, 'registered', 'Novo cliente chegou por indicação.' from r;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'appointment_id', b.appointment_id,
    'manage_token', b.manage_token,           -- devolvido UMA vez; no banco fica só o hash
    'customer_id', cust.id,
    'professional_id', b.professional_id,
    'status', b.status,
    'is_new_customer', is_new
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Ações sobre um agendamento (núcleo compartilhado por cliente/token/admin)
-- ---------------------------------------------------------------------------
create or replace function app.assert_change_window(p_appt public.appointments)
returns void
language plpgsql stable
set search_path = ''
as $$
declare h int;
begin
  select customer_change_limit_hours into h from public.business_settings where business_id = p_appt.business_id;
  if p_appt.starts_at - now() < make_interval(hours => coalesce(h, 0)) then
    perform app.fail('TOO_LATE',
      format('Cancelamentos e remarcações são permitidos até %sh antes. Fale com a barbearia pelo WhatsApp.', h));
  end if;
end;
$$;

create or replace function app.cancel_core(p_id uuid, p_actor text, p_reason text, p_enforce_window boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare a public.appointments;
begin
  select * into a from public.appointments where id = p_id for update;
  if a.id is null then perform app.fail('NOT_FOUND', 'Agendamento não encontrado.'); end if;
  if a.status not in ('pending', 'confirmed') then
    perform app.fail('INVALID_STATUS', 'Este agendamento não pode mais ser cancelado.');
  end if;
  if p_enforce_window then perform app.assert_change_window(a); end if;
  update public.appointments
     set status = 'cancelled', cancelled_at = now(), cancel_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = a.id;
  perform app.status_log(a.business_id, a.id, a.status, 'cancelled', p_actor,
                         coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Cancelado'));
end;
$$;

create or replace function app.reschedule_core(
  p_id uuid, p_new_starts timestamptz, p_new_professional uuid, p_actor text, p_enforce_window boolean
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  a public.appointments;
  admin boolean := (p_actor = 'admin');
  wanted uuid;
  cand record;
  reason text;
  svc public.services;
  price int;
  chosen uuid;
  tz text;
begin
  select * into a from public.appointments where id = p_id for update;
  if a.id is null then perform app.fail('NOT_FOUND', 'Agendamento não encontrado.'); end if;
  if a.status not in ('pending', 'confirmed') then
    perform app.fail('INVALID_STATUS', 'Este agendamento não pode ser remarcado.');
  end if;
  if p_enforce_window then perform app.assert_change_window(a); end if;
  select * into svc from public.services where id = a.service_id;
  tz := app.tz(a.business_id);
  wanted := coalesce(p_new_professional, a.professional_id);

  -- Mantém o mesmo profissional (ou o escolhido). "Qualquer" não se aplica à remarcação por token.
  reason := app.slot_rejection(a.business_id, wanted, a.service_id, p_new_starts, admin, not admin, a.id);
  if reason is not null then perform app.fail('SLOT_UNAVAILABLE', app.rejection_message(reason)); end if;
  chosen := wanted;

  price := app.price_for(svc, extract(dow from app.local_date(p_new_starts, tz))::int);
  begin
    update public.appointments
       set professional_id = chosen,
           starts_at = p_new_starts,
           ends_at = p_new_starts + make_interval(mins => a.duration_minutes),
           price_cents = price,
           price_is_starting_at = svc.price_is_starting_at and price is not distinct from svc.price_cents,
           rescheduled_from_starts_at = a.starts_at
     where id = a.id;
  exception when exclusion_violation then
    perform app.fail('SLOT_UNAVAILABLE', app.rejection_message('conflict'));
  end;
  perform app.status_log(a.business_id, a.id, a.status, a.status, p_actor, 'Remarcado');
  return a.id;
end;
$$;

create or replace function app.appointment_by_token(p_token text)
returns public.appointments
language sql stable
set search_path = ''
as $$
  select a.* from public.appointments a
   where a.manage_token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- ---------------------------------------------------------------------------
-- Cliente sem login: link secreto (token). O token de 192 bits é o "segredo".
-- ---------------------------------------------------------------------------
create or replace function public.get_booking_by_token(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare a public.appointments; pro text; biz record;
begin
  a := app.appointment_by_token(p_token);
  if a.id is null then perform app.fail('NOT_FOUND', 'Agendamento não encontrado.'); end if;
  select name into pro from public.professionals where id = a.professional_id;
  select name, whatsapp_e164 into biz from public.businesses where id = a.business_id;
  return jsonb_build_object(
    'id', a.id, 'status', a.status, 'service_name', a.service_name, 'professional_name', pro,
    'starts_at', a.starts_at, 'ends_at', a.ends_at, 'price_cents', a.price_cents,
    'price_is_starting_at', a.price_is_starting_at, 'business_name', biz.name,
    'business_whatsapp', biz.whatsapp_e164
  );
end;
$$;

create or replace function public.cancel_booking_by_token(p_token text, p_reason text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare a public.appointments;
begin
  a := app.appointment_by_token(p_token);
  if a.id is null then perform app.fail('FORBIDDEN', 'Você não tem acesso a este agendamento.'); end if;
  perform app.cancel_core(a.id, 'customer', p_reason, true);
end;
$$;

create or replace function public.reschedule_booking_by_token(p_token text, p_new_starts_at timestamptz)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare a public.appointments;
begin
  a := app.appointment_by_token(p_token);
  if a.id is null then perform app.fail('FORBIDDEN', 'Você não tem acesso a este agendamento.'); end if;
  perform app.reschedule_core(a.id, p_new_starts_at, null, 'customer', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cliente logado (Supabase Auth): só mexe no que é dele
-- ---------------------------------------------------------------------------
create or replace function public.cancel_my_appointment(p_appointment uuid, p_reason text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.appointments a
                  where a.id = p_appointment and a.customer_id in (select app.my_customer_ids())) then
    perform app.fail('FORBIDDEN', 'Você não tem acesso a este agendamento.');
  end if;
  perform app.cancel_core(p_appointment, 'customer', p_reason, true);
end;
$$;

create or replace function public.reschedule_my_appointment(p_appointment uuid, p_new_starts_at timestamptz)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.appointments a
                  where a.id = p_appointment and a.customer_id in (select app.my_customer_ids())) then
    perform app.fail('FORBIDDEN', 'Você não tem acesso a este agendamento.');
  end if;
  perform app.reschedule_core(p_appointment, p_new_starts_at, null, 'customer', true);
end;
$$;

/** Cliente logado edita apenas os próprios dados de contato (nunca WhatsApp/tenant/pontos). */
create or replace function public.update_my_profile(p_customer uuid, p_name text, p_email text, p_birth_date date)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.customers c where c.id = p_customer and c.auth_user_id = (select auth.uid())) then
    perform app.fail('FORBIDDEN', 'Você não tem acesso a este cadastro.');
  end if;
  if length(btrim(coalesce(p_name, ''))) < 2 then perform app.fail('VALIDATION', 'Informe seu nome.'); end if;
  update public.customers
     set name = btrim(p_name), email = nullif(btrim(coalesce(p_email, '')), ''), birth_date = p_birth_date
   where id = p_customer;
end;
$$;

-- ---------------------------------------------------------------------------
-- Login do cliente: vincula o usuário do Supabase Auth ao cadastro (CRM) pelo WhatsApp
-- CONFIRMADO (OTP por SMS/WhatsApp). Sem número confirmado, não vincula nada — o WhatsApp é
-- a identidade do cliente, então nunca aceitamos um número apenas digitado.
-- ---------------------------------------------------------------------------
create or replace function public.claim_my_customer(p_business uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare u record; wa text; c public.customers;
begin
  if auth.uid() is null then perform app.fail('FORBIDDEN', 'Entre na sua conta para continuar.'); end if;
  select phone, phone_confirmed_at into u from auth.users where id = auth.uid();
  wa := app.normalize_whatsapp(u.phone);
  if u.phone_confirmed_at is null or wa is null then
    perform app.fail('FORBIDDEN', 'Confirme seu WhatsApp para acessar sua conta.');
  end if;
  select * into c from public.customers where business_id = p_business and whatsapp = wa;
  if c.id is null then
    perform app.fail('NOT_FOUND', 'Não encontramos um cadastro com esse WhatsApp. Faça um agendamento para se cadastrar.');
  end if;
  update public.customers set auth_user_id = auth.uid() where id = c.id;
  return c.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Painel (equipe). Cada função revalida papel e tenant.
-- ---------------------------------------------------------------------------
create or replace function app.require_staff(p_business uuid, p_admin_only boolean default false)
returns void
language plpgsql stable
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not (case when p_admin_only then app.is_admin(p_business) else app.is_member(p_business) end) then
    perform app.fail('FORBIDDEN', 'Você não tem permissão para esta ação.');
  end if;
end;
$$;

create or replace function public.admin_create_booking(
  p_business uuid, p_service uuid, p_professional uuid, p_starts_at timestamptz, p_customer uuid,
  p_notes text default ''
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare b record;
begin
  perform app.require_staff(p_business);
  if not exists (select 1 from public.customers c where c.id = p_customer and c.business_id = p_business) then
    perform app.fail('NOT_FOUND', 'Cliente não encontrado.');
  end if;
  select * into b from app.insert_booking(p_business, p_customer, p_service, p_professional, p_starts_at, p_notes, 'admin');
  return jsonb_build_object('appointment_id', b.appointment_id, 'professional_id', b.professional_id, 'status', b.status);
end;
$$;

create or replace function app.staff_appointment(p_id uuid, p_admin_only boolean default false)
returns public.appointments
language plpgsql stable
set search_path = ''
as $$
declare a public.appointments;
begin
  select * into a from public.appointments where id = p_id;
  if a.id is null then perform app.fail('NOT_FOUND', 'Agendamento não encontrado.'); end if;
  perform app.require_staff(a.business_id, p_admin_only);
  return a;
end;
$$;

create or replace function public.admin_confirm_appointment(p_appointment uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare a public.appointments;
begin
  a := app.staff_appointment(p_appointment);
  update public.appointments set status = 'confirmed' where id = a.id and status = 'pending';
  if not found then perform app.fail('INVALID_STATUS', 'Só agendamentos pendentes podem ser confirmados.'); end if;
  perform app.status_log(a.business_id, a.id, 'pending', 'confirmed', 'admin', 'Confirmado pela equipe');
end;
$$;

create or replace function public.admin_mark_no_show(p_appointment uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare a public.appointments;
begin
  a := app.staff_appointment(p_appointment);
  update public.appointments set status = 'no_show' where id = a.id and status in ('pending', 'confirmed');
  if not found then perform app.fail('INVALID_STATUS', 'Só é possível marcar falta em agendamentos ativos.'); end if;
  perform app.status_log(a.business_id, a.id, a.status, 'no_show', 'admin', 'Cliente não compareceu');
end;
$$;

create or replace function public.admin_cancel_appointment(p_appointment uuid, p_reason text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare a public.appointments;
begin
  a := app.staff_appointment(p_appointment);
  perform app.cancel_core(a.id, 'admin', p_reason, false);
end;
$$;

create or replace function public.admin_reschedule_appointment(
  p_appointment uuid, p_new_starts_at timestamptz, p_new_professional uuid default null
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare a public.appointments;
begin
  a := app.staff_appointment(p_appointment);
  perform app.reschedule_core(a.id, p_new_starts_at, p_new_professional, 'admin', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões de execução: nada é público por padrão.
-- ---------------------------------------------------------------------------
revoke all on function public.available_slots(uuid, uuid, date, uuid) from public;
revoke all on function public.available_days(uuid, uuid, date, int, uuid) from public;
revoke all on function public.create_booking(uuid, uuid, uuid, timestamptz, text, text, text, date, text, text) from public;
revoke all on function public.get_booking_by_token(text) from public;
revoke all on function public.cancel_booking_by_token(text, text) from public;
revoke all on function public.reschedule_booking_by_token(text, timestamptz) from public;
revoke all on function public.cancel_my_appointment(uuid, text) from public;
revoke all on function public.reschedule_my_appointment(uuid, timestamptz) from public;
revoke all on function public.update_my_profile(uuid, text, text, date) from public;
revoke all on function public.claim_my_customer(uuid) from public;
revoke all on function public.admin_create_booking(uuid, uuid, uuid, timestamptz, uuid, text) from public;
revoke all on function public.admin_confirm_appointment(uuid) from public;
revoke all on function public.admin_mark_no_show(uuid) from public;
revoke all on function public.admin_cancel_appointment(uuid, text) from public;
revoke all on function public.admin_reschedule_appointment(uuid, timestamptz, uuid) from public;

grant execute on function public.available_slots(uuid, uuid, date, uuid) to anon, authenticated;
grant execute on function public.available_days(uuid, uuid, date, int, uuid) to anon, authenticated;
grant execute on function public.create_booking(uuid, uuid, uuid, timestamptz, text, text, text, date, text, text) to anon, authenticated;
grant execute on function public.get_booking_by_token(text) to anon, authenticated;
grant execute on function public.cancel_booking_by_token(text, text) to anon, authenticated;
grant execute on function public.reschedule_booking_by_token(text, timestamptz) to anon, authenticated;
grant execute on function public.cancel_my_appointment(uuid, text) to authenticated;
grant execute on function public.reschedule_my_appointment(uuid, timestamptz) to authenticated;
grant execute on function public.update_my_profile(uuid, text, text, date) to authenticated;
grant execute on function public.claim_my_customer(uuid) to authenticated;
grant execute on function public.admin_create_booking(uuid, uuid, uuid, timestamptz, uuid, text) to authenticated;
grant execute on function public.admin_confirm_appointment(uuid) to authenticated;
grant execute on function public.admin_mark_no_show(uuid) to authenticated;
grant execute on function public.admin_cancel_appointment(uuid, text) to authenticated;
grant execute on function public.admin_reschedule_appointment(uuid, timestamptz, uuid) to authenticated;
-- Funções do schema app (núcleo/insert_booking etc.) NÃO são concedidas a anon/authenticated:
-- só são chamadas dentro das funções SECURITY DEFINER acima.

-- Defesa em profundidade: funções internas do schema app não ficam executáveis por PUBLIC.
-- (Os auxiliares de RLS — is_member/is_admin/is_owner/my_customer_ids — têm GRANT explícito no 0002.)
revoke execute on all functions in schema app from public;
