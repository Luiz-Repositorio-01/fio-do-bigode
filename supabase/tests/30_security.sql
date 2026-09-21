-- Segurança: login do cliente, RLS multi-tenant, permissões e ledger append-only.
do $$
declare n int; r record;
begin
  -- Login do cliente: só vincula com WhatsApp CONFIRMADO
  perform t.su();
  update auth.users set phone = '5519988880001', phone_confirmed_at = now() where id = t.id('userA');
  update auth.users set phone = '5519988880002', phone_confirmed_at = null where id = t.id('userB');
  perform t.login('userA');
  perform t.ok(public.claim_my_customer(t.id('bizA')) = t.get('custA')::uuid, 'userA vincula ao próprio cadastro (WhatsApp confirmado)');
  perform t.login('userB');
  perform t.fails($q$select public.claim_my_customer(t.id('bizA'))$q$, 'FORBIDDEN', 'WhatsApp NÃO confirmado não vincula');
  perform t.su();
  update auth.users set phone_confirmed_at = now() where id = t.id('userB');
  perform t.login('userB');
  perform t.ok(public.claim_my_customer(t.id('bizA')) = t.get('custB')::uuid, 'userB vincula depois de confirmar');
  perform t.login('userR');
  perform t.fails($q$select public.claim_my_customer(t.id('bizA'))$q$, 'FORBIDDEN', 'usuário sem telefone não vincula');

  -- anon: nada de dados privados
  perform t.anon();
  perform t.fails('select * from public.customers', '42501', 'anon não lê customers');
  perform t.fails('select * from public.appointments', '42501', 'anon não lê appointments');
  perform t.fails('select * from public.loyalty_transactions', '42501', 'anon não lê o ledger');
  perform t.fails('select * from public.customer_notes', '42501', 'anon não lê observações internas');
  perform t.fails('select * from public.blocked_periods', '42501', 'anon não lê bloqueios (motivos internos)');
  perform t.fails('select * from public.audit_log', '42501', 'anon não lê auditoria');
  perform t.fails($q$insert into public.services (business_id, name, duration_minutes) values (t.id('bizA'), 'Hack', 30)$q$,
                  '42501', 'anon não cria serviço');
  perform t.fails($q$select public.admin_complete_appointment(t.get('apptA')::uuid, 100)$q$, '42501', 'anon não executa RPC do painel');
  perform t.fails($q$select public.run_daily_jobs()$q$, '42501', 'anon não executa rotina diária');
  perform t.fails($q$select app.cancel_core(t.get('apptA')::uuid, 'admin', 'x', false)$q$, '42501', 'anon não executa funções internas (app.*)');
  select count(*) into n from public.services; perform t.ok(n = 4, 'anon lê apenas o catálogo público (4 serviços ativos de A e B)');
  select count(*) into n from public.professionals where business_id = t.id('bizA'); perform t.ok(n = 2, 'anon lê equipe ativa');

  -- Cliente A (logado): só o que é dele
  perform t.login('userA');
  select count(*) into n from public.customers; perform t.ok(n = 1, 'cliente A enxerga só o próprio cadastro');
  select count(*) into n from public.customers where id = t.get('custB')::uuid;
  perform t.ok(n = 0, 'mexer no ID de outro cliente não abre nada (RLS)');
  select count(*) into n from public.appointments; perform t.ok(n = 2, 'cliente A vê só os próprios agendamentos (cancelado + novo)');
  select count(*) into n from public.appointments where id = t.get('apptB')::uuid; perform t.ok(n = 0, 'cliente A não vê o agendamento de B por ID');
  update public.customers set name = 'Hackeado' where id = t.get('custB')::uuid;
  get diagnostics n = row_count; perform t.ok(n = 0, 'cliente A não altera cadastro de B');
  update public.customers set name = 'Hackeado' where id = t.get('custA')::uuid;
  get diagnostics n = row_count; perform t.ok(n = 0, 'cliente não edita o cadastro direto (só via update_my_profile)');
  perform t.fails($q$update public.appointments set status = 'completed' where id = t.get('apptA')::uuid$q$, '42501', 'cliente não conclui atendimento');
  perform t.fails($q$insert into public.loyalty_transactions (business_id, customer_id, type, amount)
                      values (t.id('bizA'), t.get('custA')::uuid, 'BONUS', 100000)$q$, '42501', 'cliente não cria pontos');
  perform t.fails($q$select public.admin_adjust_points(t.get('custA')::uuid, 1000, 'me dá pontos')$q$, 'FORBIDDEN', 'cliente não ajusta pontos');
  perform t.fails($q$select public.admin_complete_appointment(t.get('apptA')::uuid, 100)$q$, 'FORBIDDEN', 'cliente não conclui via RPC');
  perform t.fails($q$select public.cancel_my_appointment(t.get('apptB')::uuid)$q$, 'FORBIDDEN', 'cliente A não cancela agendamento de B');
  perform t.fails($q$select public.update_my_profile(t.get('custB')::uuid, 'Novo', null, null)$q$, 'FORBIDDEN', 'cliente A não edita perfil de B');
  perform public.update_my_profile(t.get('custA')::uuid, 'Cliente A Silva', 'a@test.local', date '1990-05-20');
  perform t.ok((select name from public.customers) = 'Cliente A Silva', 'cliente edita o próprio perfil via RPC');
  update public.business_settings set auto_confirm = false where business_id = t.id('bizA');
  get diagnostics n = row_count; perform t.ok(n = 0, 'cliente não altera configurações');

  -- Equipe: observações internas nunca chegam ao cliente
  perform t.login('staffA');
  insert into public.customer_notes (business_id, customer_id, body, author_id)
  values (t.id('bizA'), t.get('custA')::uuid, 'Prefere degradê baixo; chega sempre 5 min atrasado', t.id('staffA'));
  select count(*) into n from public.customer_notes; perform t.ok(n = 1, 'equipe registra e lê observação interna');
  perform t.fails($q$insert into public.customer_notes (business_id, customer_id, body, author_id)
                      values (t.id('bizA'), t.get('custA')::uuid, 'forjada', t.id('adminA'))$q$, '42501', 'equipe não forja autoria da nota');
  perform t.login('userA');
  select count(*) into n from public.customer_notes; perform t.ok(n = 0, 'cliente NÃO vê observações internas');
  perform t.fails($q$insert into public.customer_notes (business_id, customer_id, body, author_id)
                      values (t.id('bizA'), t.get('custA')::uuid, 'x', t.id('userA'))$q$, '42501', 'cliente não escreve notas');

  -- Multi-tenant: equipe só vê a própria barbearia
  perform t.su();
  insert into public.customers (id, business_id, name, whatsapp, referral_code)
  values (gen_random_uuid(), t.id('bizB'), 'Cliente da B', '5519977770001', 'CLIB100');
  perform t.login('staffA');
  select count(*) into n from public.customers where business_id = t.id('bizB'); perform t.ok(n = 0, 'equipe de A não vê clientes de B');
  select count(*) into n from public.customers where business_id = t.id('bizA'); perform t.ok(n >= 5, 'equipe de A vê os clientes de A');
  perform t.login('adminB');
  select count(*) into n from public.customers; perform t.ok(n = 1, 'admin de B vê só o cliente de B');
  select count(*) into n from public.appointments; perform t.ok(n = 0, 'admin de B não vê agendamentos de A');
  perform t.fails($q$select public.admin_complete_appointment(t.get('apptA')::uuid, 100)$q$, 'FORBIDDEN', 'admin de B não conclui agendamento de A');
  perform t.fails($q$select public.admin_cancel_appointment(t.get('apptA')::uuid)$q$, 'FORBIDDEN', 'admin de B não cancela agendamento de A');
  perform t.fails($q$select public.admin_delete_customer(t.get('custA')::uuid)$q$, 'FORBIDDEN', 'admin de B não exclui cliente de A');
  perform t.fails($q$select public.admin_create_booking(t.id('bizA'), t.id('svcCorte'), t.id('proH'), now() + interval '9 days', t.get('custA')::uuid)$q$,
                  'FORBIDDEN', 'admin de B não agenda na barbearia A');
  update public.business_settings set auto_confirm = false where business_id = t.id('bizA');
  get diagnostics n = row_count; perform t.ok(n = 0, 'admin de B não altera configurações de A');
  perform t.fails($q$insert into public.services (business_id, name, duration_minutes) values (t.id('bizA'), 'Invasão', 30)$q$,
                  '42501', 'admin de B não cria serviço em A');
  perform t.fails($q$insert into public.business_members values (t.id('bizA'), t.id('adminB'), 'owner')$q$, '42501', 'ninguém se promove a owner de outra barbearia');

  -- Papéis dentro da mesma barbearia
  perform t.login('staffA');
  perform t.fails($q$insert into public.services (business_id, name, duration_minutes) values (t.id('bizA'), 'Novo', 30)$q$,
                  '42501', 'staff não cria serviço (só admin/owner)');
  update public.business_settings set min_notice_minutes = 10 where business_id = t.id('bizA');
  get diagnostics n = row_count; perform t.ok(n = 0, 'staff não altera configurações');
  perform t.fails($q$select public.admin_adjust_points(t.get('custA')::uuid, 10, 'x')$q$, 'FORBIDDEN', 'staff não ajusta pontos');
  perform t.fails($q$select public.admin_delete_customer(t.get('custD')::uuid)$q$, 'FORBIDDEN', 'staff não exclui cliente (LGPD é só admin)');
  perform t.login('adminA');
  insert into public.services (business_id, name, duration_minutes, price_cents) values (t.id('bizA'), 'Sobrancelha', 15, 1500);
  perform t.ok(true, 'admin cria serviço na própria barbearia');
  delete from public.services where name = 'Sobrancelha';
  perform t.su();
end $$;

-- Exclusion constraint (garantias no banco, independentes da aplicação)
do $$
begin
  perform t.su();
  -- double booking direto na tabela: a constraint barra mesmo sem passar pela RPC
  perform t.fails(format($q$insert into public.appointments (business_id, customer_id, professional_id, service_id, service_name,
        duration_minutes, starts_at, ends_at, status, manage_token_hash)
        values (%L, %L, %L, %L, 'Corte', 30, %L, %L, 'confirmed', 'h-dup')$q$,
        t.id('bizA'), t.get('custC'), t.id('proH'), t.id('svcCorte'), t.at(3, '14:00'), t.at(3, '14:30')),
        '23P01', 'exclusion constraint impede double booking direto');
  -- cancelado NÃO ocupa horário
  insert into public.appointments (business_id, customer_id, professional_id, service_id, service_name,
        duration_minutes, starts_at, ends_at, status, manage_token_hash)
  values (t.id('bizA'), t.get('custC')::uuid, t.id('proH'), t.id('svcCorte'), 'Corte', 30, t.at(3, '14:00'), t.at(3, '14:30'), 'cancelled', 'h-cancelled');
  perform t.ok(true, 'agendamento cancelado não conflita com o horário ocupado');
end $$;
