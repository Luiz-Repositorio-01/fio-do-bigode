-- Helpers de teste + dados de exemplo (2 barbearias, para provar o isolamento multi-tenant).
create schema t;
create table t.k (name text primary key, id uuid not null default gen_random_uuid());
create table t.v (name text primary key, val text);
create table t.log (msg text);
grant usage on schema t to public;

create function t.id(n text) returns uuid language sql stable as $$ select id from t.k where name = n $$;
create function t.get(n text) returns text language sql stable as $$ select val from t.v where name = n $$;
create function t.put(n text, x text) returns void language sql security definer as
$$ insert into t.v values (n, x) on conflict (name) do update set val = excluded.val $$;
create function t.ok(cond boolean, msg text) returns void language plpgsql security definer as $$
begin
  if cond is not true then raise exception 'FALHOU: %', msg; end if;
  insert into t.log values (msg);
end $$;
create function t.login(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', t.id(u)::text, true);
  execute 'set local role authenticated';
end $$;
create function t.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $$;
create function t.su() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
-- Espera erro cujo detail (código de negócio) OU sqlstate seja `code`.
create function t.fails(sql text, code text, label text) returns void language plpgsql as $$
declare raised boolean := false; d text; s text; m text;
begin
  begin execute sql;
  exception when others then
    raised := true;
    get stacked diagnostics d = pg_exception_detail, s = returned_sqlstate, m = message_text;
  end;
  if not raised then raise exception 'FALHOU (não deu erro): %', label; end if;
  if d is distinct from code and s is distinct from code then
    raise exception 'FALHOU: % — esperado %, veio detail=% sqlstate=% (%)', label, code, d, s, m;
  end if;
  perform t.ok(true, label);
end $$;
grant execute on all functions in schema t to public;
grant select on all tables in schema t to public;

-- Data alvo: 3 dias à frente (fuso de Brasília), às 14:00 locais.
create function t.day(offset_days int) returns date language sql stable as
$$ select (now() at time zone 'America/Sao_Paulo')::date + offset_days $$;
create function t.at(offset_days int, hhmm text) returns timestamptz language sql stable as
$$ select ((t.day(offset_days) + hhmm::time) at time zone 'America/Sao_Paulo') $$;
grant execute on all functions in schema t to public;

-- ---------------------------------------------------------------------------
-- Seed (como dono do banco; no Supabase equivale ao SQL Editor/migrations de seed)
-- ---------------------------------------------------------------------------
insert into t.k (name) values
  ('bizA'),('bizB'),('adminA'),('staffA'),('adminB'),('userA'),('userB'),('userR'),
  ('proH'),('proG'),('proB'),('svcCorte'),('svcPromo'),('svcEsp'),('svcB'),
  ('rwCorte'),('rwCaro'),('lvBronze'),('lvPrata');

insert into auth.users (id, email, phone, phone_confirmed_at)
select t.id(n), n || '@test.local', null, null from (values ('adminA'),('staffA'),('adminB'),('userA'),('userB'),('userR')) v(n);

insert into public.businesses (id, slug, name, whatsapp_e164) values
  (t.id('bizA'), 'fio-do-bigode', 'Fio do Bigode Barbearia', '5519999990001'),
  (t.id('bizB'), 'outra-barbearia', 'Outra Barbearia', '5519999990002');
insert into public.business_settings (business_id, loyalty) values
  (t.id('bizA'), '{"enabled": true, "model": "points", "pointsPerReal": 1, "pointsPerVisit": 0, "rounding": "floor",
     "pointsValidityDays": null, "visitsGoal": 10, "visitsRewardId": null, "birthdayBonusPoints": 15,
     "referral": {"enabled": true, "referrerPoints": 20, "refereePoints": 10, "monthlyLimit": 2}}'),
  (t.id('bizB'), default);
insert into public.business_members values
  (t.id('bizA'), t.id('adminA'), 'admin'), (t.id('bizA'), t.id('staffA'), 'staff'), (t.id('bizB'), t.id('adminB'), 'owner');

insert into public.professionals (id, business_id, name, sort_order) values
  (t.id('proH'), t.id('bizA'), 'Henrique', 1), (t.id('proG'), t.id('bizA'), 'Gabriel', 2),
  (t.id('proB'), t.id('bizB'), 'Profissional B', 1);
insert into public.services (id, business_id, name, price_cents, duration_minutes, points_bonus) values
  (t.id('svcCorte'), t.id('bizA'), 'Corte', 4500, 30, 5),
  (t.id('svcEsp'),   t.id('bizA'), 'Tratamento especial', 8000, 60, 0),
  (t.id('svcB'),     t.id('bizB'), 'Corte B', 4000, 30, 0);
insert into public.services (id, business_id, name, price_cents, duration_minutes, price_rules) values
  (t.id('svcPromo'), t.id('bizA'), 'Corte promo', 4500, 30,
   jsonb_build_array(jsonb_build_object('weekdays', jsonb_build_array(extract(dow from t.day(3))::int),
                                        'priceCents', 3500, 'label', 'Promo do dia')));
-- Com vínculos, o profissional faz SÓ aqueles serviços: "Tratamento especial" apenas o Gabriel.
insert into public.professional_services values
  (t.id('bizA'), t.id('proH'), t.id('svcCorte')), (t.id('bizA'), t.id('proH'), t.id('svcPromo')),
  (t.id('bizA'), t.id('proG'), t.id('svcCorte')), (t.id('bizA'), t.id('proG'), t.id('svcPromo')),
  (t.id('bizA'), t.id('proG'), t.id('svcEsp'));

insert into public.business_hours (business_id, weekday, opens_min, closes_min)
select b, d, 540, 1140 from unnest(array[t.id('bizA'), t.id('bizB')]) b, generate_series(0, 6) d;

insert into public.loyalty_levels (id, business_id, name, min_points) values
  (t.id('lvBronze'), t.id('bizA'), 'Bronze', 0), (t.id('lvPrata'), t.id('bizA'), 'Prata', 100);
insert into public.loyalty_rewards (id, business_id, name, cost_points, stock, validity_days) values
  (t.id('rwCorte'), t.id('bizA'), 'Corte grátis', 30, 1, 30),
  (t.id('rwCaro'),  t.id('bizA'), 'Combo premium', 1000, null, null);
