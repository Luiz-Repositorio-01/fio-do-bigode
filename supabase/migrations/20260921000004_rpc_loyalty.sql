-- =============================================================================
-- Fio do Bigode Barbearia — fidelidade, CRM e conclusão de atendimento (RPCs)
--
-- STATUS: PREPARADO, NÃO APLICADO (ver 0001).
--
-- Espelha src/services/loyalty.ts e completeAppointment (src/services/booking.ts).
-- Regras editáveis vivem em business_settings.loyalty (jsonb) — nada de pontos "chumbados".
-- O saldo é SEMPRE a soma de loyalty_transactions (append-only, ver 0002).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Internos
-- ---------------------------------------------------------------------------
create or replace function app.append_ledger(
  p_business uuid, p_customer uuid, p_type public.loyalty_tx_type, p_amount int,
  p_description text, p_ref_type text default null, p_ref_id text default null,
  p_expires_at timestamptz default null, p_created_by uuid default null
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare n int;
begin
  if p_amount is null or p_amount = 0 then return false; end if;
  -- Lançamentos idempotentes (mesmo type+referência) são ignorados se já existirem.
  insert into public.loyalty_transactions
    (business_id, customer_id, type, amount, description, reference_type, reference_id, expires_at, created_by)
  values (p_business, p_customer, p_type, p_amount, p_description, p_ref_type, p_ref_id, p_expires_at, p_created_by)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create or replace function app.validity_expiry(p_business uuid)
returns timestamptz
language sql stable
set search_path = ''
as $$
  select case
    when (s.loyalty ->> 'pointsValidityDays') is null then null
    else now() + make_interval(days => (s.loyalty ->> 'pointsValidityDays')::int)
  end
  from public.business_settings s where s.business_id = p_business;
$$;

create or replace function app.balance_of(p_customer uuid)
returns int
language sql stable
set search_path = ''
as $$ select coalesce(sum(t.amount), 0)::int from public.loyalty_transactions t where t.customer_id = p_customer $$;

/** Pontos de um atendimento concluído (espelha pointsForVisit). */
create or replace function app.points_for_visit(p_business uuid, p_service uuid, p_final_cents int, p_at timestamptz)
returns int
language plpgsql stable
set search_path = ''
as $$
declare
  cfg jsonb;
  mult numeric := 1;
  spend numeric;
  from_spend int;
  from_visit int;
  from_service int;
  from_campaign int;
begin
  select loyalty into cfg from public.business_settings where business_id = p_business;
  if cfg is null or not coalesce((cfg ->> 'enabled')::boolean, false) or cfg ->> 'model' = 'visits' then
    return 0;
  end if;

  select coalesce(max(c.multiplier), 1) into mult
    from public.campaigns c
   where c.business_id = p_business and c.active and c.kind = 'points_multiplier'
     and c.starts_at <= p_at and p_at <= c.ends_at;
  mult := greatest(1, mult);

  spend := (greatest(0, p_final_cents)::numeric / 100) * coalesce((cfg ->> 'pointsPerReal')::numeric, 0) * mult;
  from_spend := case coalesce(cfg ->> 'rounding', 'floor')
    when 'ceil' then ceil(spend)::int
    when 'round' then floor(spend + 0.5)::int
    else floor(spend)::int
  end;
  from_visit := greatest(0, coalesce((cfg ->> 'pointsPerVisit')::int, 0));
  select greatest(0, s.points_bonus) into from_service from public.services s where s.id = p_service;
  select coalesce(sum(c.bonus_points), 0)::int into from_campaign
    from public.campaigns c
   where c.business_id = p_business and c.active and c.kind = 'bonus_points'
     and c.starts_at <= p_at and p_at <= c.ends_at;

  return from_spend + from_visit + coalesce(from_service, 0) + from_campaign;
end;
$$;

create or replace function app.reward_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  out text := '';
  i int;
begin
  for i in 0 .. 7 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    if i = 3 then out := out || '-'; end if;
  end loop;
  return 'FDB-' || out;
end;
$$;

create or replace function app.issue_customer_reward(
  p_business uuid, p_customer uuid, p_reward uuid, p_name text, p_validity_days int,
  p_source text, p_points_spent int
)
returns text
language plpgsql
set search_path = ''
as $$
declare v_code text;
begin
  loop
    v_code := app.reward_code();
    exit when not exists (
      select 1 from public.customer_rewards r where r.business_id = p_business and r.code = v_code);
  end loop;
  insert into public.customer_rewards
    (business_id, customer_id, reward_id, reward_name, code, source, points_spent, expires_at)
  values (p_business, p_customer, p_reward, p_name, v_code, p_source, p_points_spent,
          case when p_validity_days is null then null else now() + make_interval(days => p_validity_days) end);
  return v_code;
end;
$$;

/** Recompensa automática por número de visitas (modelo visitas/híbrido). */
create or replace function app.grant_visit_reward(p_business uuid, p_customer uuid, p_visits int)
returns void
language plpgsql
set search_path = ''
as $$
declare cfg jsonb; goal int; rid uuid; rw public.loyalty_rewards;
begin
  select loyalty into cfg from public.business_settings where business_id = p_business;
  if cfg is null or not coalesce((cfg ->> 'enabled')::boolean, false) or cfg ->> 'model' = 'points' then return; end if;
  goal := coalesce((cfg ->> 'visitsGoal')::int, 0);
  if goal <= 0 or (cfg ->> 'visitsRewardId') is null or p_visits = 0 or p_visits % goal <> 0 then return; end if;
  rid := (cfg ->> 'visitsRewardId')::uuid;
  select * into rw from public.loyalty_rewards where id = rid and business_id = p_business;
  if rw.id is null then return; end if;
  perform app.issue_customer_reward(p_business, p_customer, rw.id, rw.name, rw.validity_days, 'visits', 0);
end;
$$;

/**
 * Indicação: só libera pontos quando o indicado conclui o PRIMEIRO atendimento,
 * respeitando o limite mensal do indicador (mês no fuso da barbearia).
 */
create or replace function app.qualify_referral(p_business uuid, p_referee uuid, p_visits int)
returns void
language plpgsql
set search_path = ''
as $$
declare
  cfg jsonb;
  ref public.referrals;
  tz text := app.tz(p_business);
  month_start timestamptz := date_trunc('month', now() at time zone tz) at time zone tz;
  qualified_this_month int;
  referrer_pts int; referee_pts int; monthly_limit int; exp timestamptz;
begin
  if p_visits <> 1 then return; end if;
  select * into ref from public.referrals r
   where r.business_id = p_business and r.referee_id = p_referee and r.status = 'registered' for update;
  if ref.id is null then return; end if;

  select loyalty -> 'referral' into cfg from public.business_settings where business_id = p_business;
  monthly_limit := coalesce((cfg ->> 'monthlyLimit')::int, 0);
  referrer_pts := coalesce((cfg ->> 'referrerPoints')::int, 0);
  referee_pts := coalesce((cfg ->> 'refereePoints')::int, 0);

  select count(*) into qualified_this_month
    from public.referrals r
    join public.referral_events e on e.referral_id = r.id and e.type = 'qualified'
   where r.business_id = p_business and r.referrer_id = ref.referrer_id and e.created_at >= month_start;

  if not coalesce((cfg ->> 'enabled')::boolean, false) or (monthly_limit > 0 and qualified_this_month >= monthly_limit) then
    update public.referrals set status = 'rejected' where id = ref.id;
    insert into public.referral_events (referral_id, type, note)
    values (ref.id, 'rejected',
            case when coalesce((cfg ->> 'enabled')::boolean, false)
                 then 'Limite mensal de indicações atingido.' else 'Programa de indicação desativado.' end);
    return;
  end if;

  exp := app.validity_expiry(p_business);
  perform app.append_ledger(p_business, ref.referrer_id, 'BONUS', referrer_pts, 'Indicação de amigo concluída',
                            'referral', ref.id::text || ':referrer', exp);
  perform app.append_ledger(p_business, ref.referee_id, 'BONUS', referee_pts, 'Bônus de boas-vindas por indicação',
                            'referral', ref.id::text || ':referee', exp);
  update public.referrals set status = 'qualified' where id = ref.id;
  insert into public.referral_events (referral_id, type, points, note)
  values (ref.id, 'qualified', referrer_pts + referee_pts, 'Primeiro atendimento do indicado concluído.');
end;
$$;

-- ---------------------------------------------------------------------------
-- Concluir atendimento: visita + valor + pontos + recompensa por visitas + indicação
-- numa única transação. Idempotente (não gera pontos duas vezes).
-- ---------------------------------------------------------------------------
create or replace function public.admin_complete_appointment(p_appointment uuid, p_final_price_cents int default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  a public.appointments;
  final_price int;
  pts int;
  visits int;
begin
  a := app.staff_appointment(p_appointment);
  if p_final_price_cents is not null and (p_final_price_cents < 0 or p_final_price_cents > 1000000) then
    perform app.fail('VALIDATION', 'Valor inválido.');
  end if;

  -- Bloqueia o agendamento e o cliente: dois "concluir" simultâneos não duplicam nada.
  select * into a from public.appointments where id = p_appointment for update;
  perform 1 from public.customers where id = a.customer_id for update;
  if a.status not in ('pending', 'confirmed') then
    perform app.fail('INVALID_STATUS', 'Só é possível concluir agendamentos ativos.');
  end if;
  final_price := coalesce(p_final_price_cents, a.price_cents);
  if final_price is null then
    perform app.fail('PRICE_REQUIRED', 'Informe o valor cobrado para concluir este atendimento.');
  end if;

  update public.appointments
     set status = 'completed', final_price_cents = final_price, completed_at = now()
   where id = a.id;
  perform app.status_log(a.business_id, a.id, a.status, 'completed', 'admin', 'Atendimento concluído');

  pts := app.points_for_visit(a.business_id, a.service_id, final_price, now());
  if pts > 0 and app.append_ledger(
       a.business_id, a.customer_id, 'EARN', pts, 'Atendimento concluído: ' || a.service_name,
       'appointment', a.id::text, app.validity_expiry(a.business_id), auth.uid()) then
    update public.appointments set points_awarded = pts where id = a.id;
  else
    pts := 0;
  end if;

  select count(*) into visits from public.appointments x
   where x.customer_id = a.customer_id and x.status = 'completed';
  perform app.grant_visit_reward(a.business_id, a.customer_id, visits);
  perform app.qualify_referral(a.business_id, a.customer_id, visits);

  return jsonb_build_object('appointment_id', a.id, 'final_price_cents', final_price,
                            'points_awarded', pts, 'completed_visits', visits);
end;
$$;

-- ---------------------------------------------------------------------------
-- Resgate (cliente logado)
-- ---------------------------------------------------------------------------
create or replace function public.redeem_reward(p_reward uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  rw public.loyalty_rewards;
  cust public.customers;
  enabled boolean;
  bal int;
  code text;
begin
  select * into rw from public.loyalty_rewards where id = p_reward;
  if rw.id is null then perform app.fail('NOT_FOUND', 'Recompensa ou cliente não encontrado.'); end if;
  select c.* into cust from public.customers c
   where c.business_id = rw.business_id and c.auth_user_id = (select auth.uid());
  if cust.id is null then perform app.fail('FORBIDDEN', 'Você não tem acesso a este cadastro.'); end if;

  -- Trava o cliente (evita gastar o mesmo saldo em dois resgates simultâneos) e a recompensa (estoque).
  perform 1 from public.customers where id = cust.id for update;
  select * into rw from public.loyalty_rewards where id = p_reward for update;

  select coalesce((loyalty ->> 'enabled')::boolean, false) into enabled
    from public.business_settings where business_id = rw.business_id;
  if not coalesce(enabled, false) then perform app.fail('LOYALTY', 'O programa de fidelidade está desativado.'); end if;
  if not rw.active then perform app.fail('LOYALTY', 'Essa recompensa não está disponível.'); end if;
  if rw.stock is not null and rw.stock <= 0 then perform app.fail('LOYALTY', 'Recompensa esgotada.'); end if;
  bal := app.balance_of(cust.id);
  if bal < rw.cost_points then perform app.fail('LOYALTY', 'Pontos insuficientes para resgatar.'); end if;

  perform app.append_ledger(rw.business_id, cust.id, 'REDEEM', -rw.cost_points,
                            'Recompensa resgatada: ' || rw.name, 'reward', rw.id::text, null, auth.uid());
  if rw.stock is not null then
    update public.loyalty_rewards set stock = stock - 1 where id = rw.id;
  end if;
  code := app.issue_customer_reward(rw.business_id, cust.id, rw.id, rw.name, rw.validity_days, 'points', rw.cost_points);
  return jsonb_build_object('code', code, 'reward_name', rw.name, 'points_spent', rw.cost_points,
                            'balance', app.balance_of(cust.id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Painel: pontos, benefícios, exclusão (LGPD)
-- ---------------------------------------------------------------------------
create or replace function public.admin_adjust_points(p_customer uuid, p_amount int, p_reason text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare c public.customers;
begin
  select * into c from public.customers where id = p_customer;
  if c.id is null then perform app.fail('NOT_FOUND', 'Cliente não encontrado.'); end if;
  perform app.require_staff(c.business_id, true);       -- só owner/admin ajustam pontos
  if btrim(coalesce(p_reason, '')) = '' then perform app.fail('VALIDATION', 'Informe o motivo do ajuste.'); end if;
  if p_amount is null or p_amount = 0 then
    perform app.fail('VALIDATION', 'Informe uma quantidade de pontos diferente de zero.');
  end if;
  perform 1 from public.customers where id = c.id for update;
  if p_amount < 0 and app.balance_of(c.id) + p_amount < 0 then
    perform app.fail('LOYALTY', 'O ajuste deixaria o saldo negativo.');
  end if;
  perform app.append_ledger(c.business_id, c.id, 'ADJUSTMENT', p_amount, 'Ajuste manual: ' || btrim(p_reason),
                            'manual', null,
                            case when p_amount > 0 then app.validity_expiry(c.business_id) end, auth.uid());
  insert into public.audit_log (business_id, actor_id, action, entity, entity_id, data)
  values (c.business_id, auth.uid(), 'adjust_points', 'customer', c.id::text,
          jsonb_build_object('amount', p_amount, 'reason', btrim(p_reason)));
end;
$$;

create or replace function public.admin_grant_reward(p_customer uuid, p_reward uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare c public.customers; rw public.loyalty_rewards;
begin
  select * into c from public.customers where id = p_customer;
  select * into rw from public.loyalty_rewards where id = p_reward;
  if c.id is null or rw.id is null or c.business_id <> rw.business_id then
    perform app.fail('NOT_FOUND', 'Recompensa ou cliente não encontrado.');
  end if;
  perform app.require_staff(c.business_id);
  return app.issue_customer_reward(c.business_id, c.id, rw.id, rw.name, rw.validity_days, 'admin', 0);
end;
$$;

create or replace function public.admin_mark_reward_used(p_customer_reward uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare cr public.customer_rewards;
begin
  select * into cr from public.customer_rewards where id = p_customer_reward for update;
  if cr.id is null then perform app.fail('NOT_FOUND', 'Benefício não encontrado.'); end if;
  perform app.require_staff(cr.business_id);
  if cr.status <> 'available' then perform app.fail('INVALID_STATUS', 'Benefício já utilizado ou expirado.'); end if;
  if cr.expires_at is not null and cr.expires_at <= now() then perform app.fail('INVALID_STATUS', 'Benefício expirado.'); end if;
  update public.customer_rewards set status = 'used', used_at = now() where id = cr.id;
end;
$$;

create or replace function public.admin_cancel_customer_reward(p_customer_reward uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare cr public.customer_rewards;
begin
  select * into cr from public.customer_rewards where id = p_customer_reward for update;
  if cr.id is null then perform app.fail('NOT_FOUND', 'Benefício não encontrado.'); end if;
  perform app.require_staff(cr.business_id, true);
  update public.customer_rewards set status = 'cancelled' where id = cr.id and status = 'available';
  insert into public.audit_log (business_id, actor_id, action, entity, entity_id)
  values (cr.business_id, auth.uid(), 'cancel_customer_reward', 'customer_reward', cr.id::text);
end;
$$;

/** Direito de exclusão (LGPD): apaga o cliente e TODO o histórico ligado a ele. Só owner/admin. */
create or replace function public.admin_delete_customer(p_customer uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare c public.customers;
begin
  select * into c from public.customers where id = p_customer;
  if c.id is null then perform app.fail('NOT_FOUND', 'Cliente não encontrado.'); end if;
  perform app.require_staff(c.business_id, true);
  -- Libera o DELETE do ledger apenas nesta transação.
  perform set_config('app.allow_ledger_delete', 'on', true);
  delete from public.customers where id = c.id;      -- cascata: agendamentos, notas, pontos, benefícios, indicações
  perform set_config('app.allow_ledger_delete', 'off', true);
  -- Auditoria sem dados pessoais (só o ID).
  insert into public.audit_log (business_id, actor_id, action, entity, entity_id)
  values (c.business_id, auth.uid(), 'delete_customer', 'customer', c.id::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- Rotinas diárias: expiração de pontos/benefícios e bônus de aniversário
-- ---------------------------------------------------------------------------
create or replace function app.expire_business(p_business uuid)
returns table (expired_points int, expired_rewards int)
language plpgsql
set search_path = ''
as $$
declare
  c record;
  amount int;
  pts int := 0;
  rw int;
  tz text := app.tz(p_business);
begin
  for c in select id from public.customers where business_id = p_business loop
    select greatest(0, least(
             coalesce(sum(t.amount) filter (where t.amount > 0 and t.expires_at is not null and t.expires_at <= now()), 0)
             - coalesce(-sum(t.amount) filter (where t.amount < 0), 0),
             coalesce(sum(t.amount), 0)))::int
      into amount
      from public.loyalty_transactions t where t.customer_id = c.id;
    if amount > 0 and app.append_ledger(p_business, c.id, 'EXPIRE', -amount, 'Pontos expirados',
                                        'expiration', c.id::text || ':' || app.local_date(now(), tz)::text) then
      pts := pts + amount;
    end if;
  end loop;
  update public.customer_rewards set status = 'expired'
   where business_id = p_business and status = 'available' and expires_at is not null and expires_at <= now();
  get diagnostics rw = row_count;
  expired_points := pts; expired_rewards := rw;
  return next;
end;
$$;

create or replace function app.grant_birthday_bonuses(p_business uuid)
returns int
language plpgsql
set search_path = ''
as $$
declare
  cfg jsonb;
  bonus int;
  tz text := app.tz(p_business);
  today date := app.local_date(now(), tz);
  leap boolean := (extract(year from today)::int % 4 = 0 and extract(year from today)::int % 100 <> 0)
                  or extract(year from today)::int % 400 = 0;
  c record;
  granted int := 0;
begin
  select loyalty into cfg from public.business_settings where business_id = p_business;
  bonus := coalesce((cfg ->> 'birthdayBonusPoints')::int, 0);
  if cfg is null or not coalesce((cfg ->> 'enabled')::boolean, false) or bonus <= 0 then return 0; end if;
  for c in
    select id from public.customers
     where business_id = p_business and birth_date is not null
       and ( (extract(month from birth_date) = extract(month from today) and extract(day from birth_date) = extract(day from today))
          or (not leap and extract(month from birth_date) = 2 and extract(day from birth_date) = 29
              and extract(month from today) = 2 and extract(day from today) = 28) )
  loop
    if app.append_ledger(p_business, c.id, 'BONUS', bonus, 'Bônus de aniversário', 'birthday',
                         c.id::text || ':' || extract(year from today)::int::text, app.validity_expiry(p_business)) then
      granted := granted + 1;
    end if;
  end loop;
  return granted;
end;
$$;

create or replace function public.admin_run_daily_jobs(p_business uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare e record; b int;
begin
  perform app.require_staff(p_business, true);
  select * into e from app.expire_business(p_business);
  b := app.grant_birthday_bonuses(p_business);
  return jsonb_build_object('expired_points', e.expired_points, 'expired_rewards', e.expired_rewards, 'birthday_bonuses', b);
end;
$$;

/** Para agendador externo (pg_cron / Edge Function com service_role). Não é chamável por usuários. */
create or replace function public.run_daily_jobs()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare biz record; e record; total_pts int := 0; total_b int := 0;
begin
  for biz in select id from public.businesses loop
    select * into e from app.expire_business(biz.id);
    total_pts := total_pts + e.expired_points;
    total_b := total_b + app.grant_birthday_bonuses(biz.id);
  end loop;
  return jsonb_build_object('expired_points', total_pts, 'birthday_bonuses', total_b);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões de execução
-- ---------------------------------------------------------------------------
revoke all on function public.admin_complete_appointment(uuid, int) from public;
revoke all on function public.redeem_reward(uuid) from public;
revoke all on function public.admin_adjust_points(uuid, int, text) from public;
revoke all on function public.admin_grant_reward(uuid, uuid) from public;
revoke all on function public.admin_mark_reward_used(uuid) from public;
revoke all on function public.admin_cancel_customer_reward(uuid) from public;
revoke all on function public.admin_delete_customer(uuid) from public;
revoke all on function public.admin_run_daily_jobs(uuid) from public;
revoke all on function public.run_daily_jobs() from public;

grant execute on function public.admin_complete_appointment(uuid, int) to authenticated;
grant execute on function public.redeem_reward(uuid) to authenticated;
grant execute on function public.admin_adjust_points(uuid, int, text) to authenticated;
grant execute on function public.admin_grant_reward(uuid, uuid) to authenticated;
grant execute on function public.admin_mark_reward_used(uuid) to authenticated;
grant execute on function public.admin_cancel_customer_reward(uuid) to authenticated;
grant execute on function public.admin_delete_customer(uuid) to authenticated;
grant execute on function public.admin_run_daily_jobs(uuid) to authenticated;
grant execute on function public.run_daily_jobs() to service_role;

revoke execute on all functions in schema app from public;
