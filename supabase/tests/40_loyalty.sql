-- Fidelidade: concluir atendimento → visita → pontos → resgate; indicação; expiração; LGPD.
do $$
declare r jsonb; n int; bal int; vcode text; st text;
begin
  -- Concluir A (Corte 4500 + bônus do serviço 5) → 50 pontos
  perform t.login('staffA');
  r := public.admin_complete_appointment(t.get('apptA')::uuid, null);
  perform t.ok((r ->> 'points_awarded')::int = 50, 'concluir gera 45 (R$45 × 1) + 5 (bônus do serviço) = 50 pontos');
  perform t.ok((r ->> 'completed_visits')::int = 1, 'visita registrada');
  perform t.fails($q$select public.admin_complete_appointment(t.get('apptA')::uuid, null)$q$, 'INVALID_STATUS', 'concluir duas vezes é recusado');
  perform t.su();
  select count(*) into n from public.loyalty_transactions where reference_type = 'appointment' and reference_id = t.get('apptA');
  perform t.ok(n = 1, 'pontos lançados uma única vez no ledger');
  perform t.ok((select points_awarded from public.appointments where id = t.get('apptA')::uuid) = 50, 'pontos gravados no agendamento');
  perform t.ok((select status::text from public.appointments where id = t.get('apptA')::uuid) = 'completed', 'status = completed');

  -- Cliente A vê saldo pelo ledger
  perform t.login('userA');
  select balance into bal from public.customer_balances;
  perform t.ok(bal = 50, 'saldo do cliente A = soma do ledger (50)');
  select count(*) into n from public.loyalty_transactions; perform t.ok(n = 1, 'cliente vê só o próprio extrato');

  -- Valor final informado pela equipe (admin): B paga 50,00 → 50 + 5 = 55
  perform t.login('adminA');
  r := public.admin_complete_appointment(t.get('apptB')::uuid, 5000);
  perform t.ok((r ->> 'points_awarded')::int = 55, 'valor final manual (R$50) gera 55 pontos');

  -- Serviço "Consultar" (sem preço): exige o valor cobrado
  perform t.su();
  update public.services set price_cents = null where id = t.id('svcEsp');
  insert into public.appointments (id, business_id, customer_id, professional_id, service_id, service_name, duration_minutes,
     starts_at, ends_at, status, price_cents, manage_token_hash)
  values (gen_random_uuid(), t.id('bizA'), t.get('custC')::uuid, t.id('proG'), t.id('svcEsp'), 'Tratamento especial', 60,
     t.at(6, '10:00'), t.at(6, '11:00'), 'confirmed', null, 'h-consultar') returning id into vcode;
  perform t.put('apptC', vcode);
  perform t.login('adminA');
  perform t.fails($q$select public.admin_complete_appointment(t.get('apptC')::uuid, null)$q$, 'PRICE_REQUIRED', 'sem preço exige valor cobrado');
  r := public.admin_complete_appointment(t.get('apptC')::uuid, 8000);
  perform t.ok((r ->> 'points_awarded')::int = 80, 'concluir com valor informado (R$80) gera 80 pontos');

  -- Campanhas: multiplicador e bônus
  perform t.su();
  insert into public.campaigns (business_id, name, kind, starts_at, ends_at, multiplier)
  values (t.id('bizA'), '2x', 'points_multiplier', now() - interval '1 day', now() + interval '1 day', 2);
  insert into public.campaigns (business_id, name, kind, starts_at, ends_at, bonus_points)
  values (t.id('bizA'), 'Bônus', 'bonus_points', now() - interval '1 day', now() + interval '1 day', 10);
  perform t.ok(app.points_for_visit(t.id('bizA'), t.id('svcCorte'), 4500, now()) = 105, 'campanha 2x + bônus: 90 + 5 + 10 = 105');
  perform t.ok(app.points_for_visit(t.id('bizA'), t.id('svcCorte'), 4500, now() + interval '3 days') = 50, 'fora da vigência volta a 50');
  delete from public.campaigns where business_id = t.id('bizA');

  -- Resgate (A: 50 pontos; recompensa custa 30, estoque 1)
  perform t.login('userA');
  r := public.redeem_reward(t.id('rwCorte'));
  perform t.ok((r ->> 'code') ~ '^FDB-[A-Z2-9]{4}-[A-Z2-9]{4}$', 'resgate gera código FDB-XXXX-XXXX');
  perform t.put('codeA', r ->> 'code');
  perform t.ok((r ->> 'balance')::int = 20, 'saldo após resgate = 20');
  select balance into bal from public.customer_balances; perform t.ok(bal = 20, 'saldo (view) = 20');
  perform t.fails($q$select public.redeem_reward(t.id('rwCaro'))$q$, 'LOYALTY', 'pontos insuficientes é recusado');
  perform t.login('userB');   -- B tem 55 pontos, mas o estoque acabou
  perform t.fails($q$select public.redeem_reward(t.id('rwCorte'))$q$, 'LOYALTY', 'estoque esgotado é recusado');
  perform t.login('userR');   -- sem cadastro na barbearia
  perform t.fails($q$select public.redeem_reward(t.id('rwCorte'))$q$, 'FORBIDDEN', 'usuário sem cadastro não resgata');
  perform t.login('adminB');  -- outro tenant
  perform t.fails($q$select public.redeem_reward(t.id('rwCorte'))$q$, 'FORBIDDEN', 'usuário de outro tenant não resgata recompensa de A');

  -- Uso do benefício no balcão
  perform t.login('userA');
  perform t.fails($q$select public.admin_mark_reward_used((select id from public.customer_rewards limit 1))$q$, 'FORBIDDEN', 'cliente não marca benefício como usado');
  select id::text into vcode from public.customer_rewards limit 1;
  perform t.login('staffA');
  perform public.admin_mark_reward_used(vcode::uuid);
  perform t.fails(format($q$select public.admin_mark_reward_used(%L)$q$, vcode), 'INVALID_STATUS', 'benefício não pode ser usado duas vezes');
  perform t.su();
  select status::text into st from public.customer_rewards where id = vcode::uuid; perform t.ok(st = 'used', 'benefício marcado como usado');

  -- Ajuste manual (só admin), com auditoria
  perform t.login('adminA');
  perform public.admin_adjust_points(t.get('custA')::uuid, 10, 'Cortesia por indicação verbal');
  perform t.fails($q$select public.admin_adjust_points(t.get('custA')::uuid, -500, 'x')$q$, 'LOYALTY', 'ajuste não deixa saldo negativo');
  perform t.fails($q$select public.admin_adjust_points(t.get('custA')::uuid, 5, '  ')$q$, 'VALIDATION', 'ajuste exige motivo');
  perform t.fails($q$select public.admin_adjust_points(t.get('custA')::uuid, 0, 'zero')$q$, 'VALIDATION', 'ajuste de zero é recusado');
  select count(*) into n from public.audit_log where action = 'adjust_points'; perform t.ok(n = 1, 'ajuste registrado na auditoria');
  perform t.login('userA'); select balance into bal from public.customer_balances; perform t.ok(bal = 30, 'saldo final de A = 50 − 30 + 10 = 30');
  perform t.su();
end $$;

-- Ledger APPEND-ONLY: já existem lançamentos, então UPDATE/DELETE/TRUNCATE precisam falhar
do $$
begin
  perform t.su();
  perform t.ok((select count(*) from public.loyalty_transactions) > 0, 'ledger tem lançamentos para o teste');
  perform t.fails($q$update public.loyalty_transactions set amount = amount + 1$q$, '42501', 'ledger: UPDATE bloqueado (até para o dono do banco)');
  perform t.fails($q$delete from public.loyalty_transactions$q$, '42501', 'ledger: DELETE bloqueado');
  perform t.fails($q$truncate public.loyalty_transactions$q$, '42501', 'ledger: TRUNCATE bloqueado');
  perform t.login('adminA');
  perform t.fails($q$delete from public.loyalty_transactions$q$, '42501', 'ledger: admin também não apaga');
  perform t.su();
end $$;

-- Indicação: só libera pontos no 1º atendimento concluído do indicado; limite mensal = 2
do $$
declare ref text; r jsonb; ids uuid[] := '{}'; i int; n int; a int; slot text[] := array['10:00','10:30','11:00'];
begin
  perform t.su();
  select referral_code into ref from public.customers where id = t.get('custA')::uuid;
  perform t.anon();
  for i in 1 .. 3 loop
    r := public.create_booking(t.id('bizA'), t.id('svcCorte'), t.id('proH'), t.at(4, slot[i]),
                               'Indicado ' || i, '1997777000' || i, null, null, '', lower(ref));   -- código em minúsculas também vale
    perform t.put('ref' || i, r ->> 'appointment_id'); perform t.put('refc' || i, r ->> 'customer_id');
  end loop;
  perform t.su();
  select count(*) into n from public.referrals where referrer_id = t.get('custA')::uuid and status = 'registered';
  perform t.ok(n = 3, '3 indicações registradas');
  perform t.ok(not exists (select 1 from public.loyalty_transactions where reference_type = 'referral'), 'nenhum ponto liberado só por se cadastrar');
  -- código inválido é ignorado sem quebrar o agendamento
  perform t.anon();
  r := public.create_booking(t.id('bizA'), t.id('svcCorte'), t.id('proH'), t.at(4, '12:00'), 'Sem Indicação', '19977770009', null, null, '', 'NAOEXISTE');
  perform t.su();
  perform t.ok(not exists (select 1 from public.referrals where referee_id = (r ->> 'customer_id')::uuid), 'código inexistente é ignorado');

  perform t.login('adminA');
  for i in 1 .. 3 loop perform public.admin_complete_appointment(t.get('ref' || i)::uuid, 4000); end loop;
  perform t.su();
  select count(*) into n from public.referrals where referrer_id = t.get('custA')::uuid and status = 'qualified'; perform t.ok(n = 2, 'só 2 indicações qualificadas (limite mensal)');
  select count(*) into n from public.referrals where referrer_id = t.get('custA')::uuid and status = 'rejected'; perform t.ok(n = 1, 'a 3ª foi rejeitada pelo limite mensal');
  select coalesce(sum(amount), 0) into a from public.loyalty_transactions
   where customer_id = t.get('custA')::uuid and reference_type = 'referral'; perform t.ok(a = 40, 'indicador recebeu 2 × 20 = 40 pontos');
  select coalesce(sum(amount), 0) into a from public.loyalty_transactions
   where customer_id = t.get('refc1')::uuid; perform t.ok(a = 40 + 5 + 10, 'indicado 1: 40 (R$40) + 5 (bônus do serviço) + 10 de boas-vindas');
  select coalesce(sum(amount), 0) into a from public.loyalty_transactions
   where customer_id = t.get('refc3')::uuid; perform t.ok(a = 45, 'indicado rejeitado só recebe os pontos do corte (40 + 5)');
end $$;

-- Expiração (respeita débitos: resgates consomem os pontos mais antigos) e aniversário
do $$
declare r jsonb; n int; bal int; today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform t.su();
  insert into public.loyalty_transactions (business_id, customer_id, type, amount, description, expires_at) values
    (t.id('bizA'), t.get('custD')::uuid, 'EARN', 40, 'antigo', now() - interval '1 day'),
    (t.id('bizA'), t.get('custD')::uuid, 'REDEEM', -30, 'resgate', null);
  perform t.login('adminA');
  r := public.admin_run_daily_jobs(t.id('bizA'));
  perform t.ok((r ->> 'expired_points')::int = 10, 'expira só o que sobrou: 40 vencidos − 30 já resgatados = 10');
  r := public.admin_run_daily_jobs(t.id('bizA'));
  perform t.ok((r ->> 'expired_points')::int = 0, 'rotina é idempotente (não expira duas vezes)');
  perform t.su();
  perform t.ok((select balance from public.customer_balances where customer_id = t.get('custD')::uuid) = 0, 'saldo do D zerou (nunca negativo)');

  -- aniversário: bônus de 15 pontos uma vez por ano
  update public.customers set birth_date = make_date(1990, extract(month from today)::int, extract(day from today)::int)
   where id = t.get('custE')::uuid;
  select count(*) into n from public.loyalty_transactions where reference_type = 'birthday' and customer_id = t.get('custE')::uuid;
  perform t.ok(n = 0, 'antes da rotina: sem bônus');
  perform t.login('adminA');
  r := public.admin_run_daily_jobs(t.id('bizA'));
  perform t.ok((r ->> 'birthday_bonuses')::int >= 1, 'bônus de aniversário concedido');
  r := public.admin_run_daily_jobs(t.id('bizA'));
  perform t.ok((r ->> 'birthday_bonuses')::int = 0, 'aniversário não duplica no mesmo ano');
  perform t.su();

  -- run_daily_jobs: só service_role
  perform t.anon();
  perform t.fails($q$select public.run_daily_jobs()$q$, '42501', 'anon não roda a rotina global');
  perform t.login('adminA');
  perform t.fails($q$select public.run_daily_jobs()$q$, '42501', 'admin logado não roda a rotina global');
  perform t.su();
  execute 'set local role service_role';
  perform public.run_daily_jobs();
  perform t.ok(true, 'service_role roda a rotina global');
  perform t.su();
end $$;

-- LGPD: exclusão do cliente apaga TUDO (inclusive o ledger, que é append-only), com trilha sem dados pessoais
do $$
declare n int;
begin
  perform t.login('staffA');
  perform t.fails($q$select public.admin_delete_customer(t.get('custD')::uuid)$q$, 'FORBIDDEN', 'staff não exclui cliente');
  perform t.login('adminA');
  perform public.admin_delete_customer(t.get('custD')::uuid);
  perform t.su();
  select count(*) into n from public.customers where id = t.get('custD')::uuid; perform t.ok(n = 0, 'cliente excluído');
  select count(*) into n from public.appointments where customer_id = t.get('custD')::uuid; perform t.ok(n = 0, 'agendamentos excluídos');
  select count(*) into n from public.loyalty_transactions where customer_id = t.get('custD')::uuid; perform t.ok(n = 0, 'ledger do cliente excluído');
  select count(*) into n from public.audit_log where action = 'delete_customer' and entity_id = t.get('custD'); perform t.ok(n = 1, 'exclusão auditada');
  perform t.fails($q$delete from public.loyalty_transactions$q$, '42501', 'ledger volta a ser append-only depois da exclusão LGPD');
end $$;

select 'Testes SQL: ' || count(*) || ' verificações passaram' as resultado from t.log;
