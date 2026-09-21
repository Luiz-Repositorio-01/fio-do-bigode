-- Disponibilidade e agendamento — inclui o cenário obrigatório:
-- Cliente A agenda 14:00 com Henrique; Cliente B tenta o mesmo horário e é bloqueado.
do $$
declare r jsonb; n int;
begin
  perform t.anon();
  -- disponibilidade pública (sem login)
  select count(*) into n from public.available_slots(t.id('bizA'), t.id('svcCorte'), t.day(3), t.id('proH'));
  perform t.ok(n = 20, 'anon vê 20 horários (09:00–19:00, de 30 em 30) para o Henrique');
  perform t.ok(exists (select 1 from public.available_slots(t.id('bizA'), t.id('svcCorte'), t.day(3), t.id('proH'))
                        where starts_at = t.at(3, '14:00')), '14:00 está livre antes da reserva');

  -- Cliente A agenda 14:00 com Henrique
  r := public.create_booking(t.id('bizA'), t.id('svcCorte'), t.id('proH'), t.at(3, '14:00'),
                             'Cliente A', '(19) 98888-0001', 'a@test.local', null, 'sem máquina 0', null);
  perform t.put('apptA', r ->> 'appointment_id'); perform t.put('tokenA', r ->> 'manage_token');
  perform t.put('custA', r ->> 'customer_id');
  perform t.ok(r ->> 'status' = 'confirmed', 'agendamento de A confirmado (auto_confirm)');
  perform t.ok(length(r ->> 'manage_token') = 48, 'token de gerenciamento devolvido (192 bits)');
  perform t.ok((r ->> 'is_new_customer')::boolean, 'A é cliente novo (CRM criado automaticamente)');

  -- Cliente B tenta o MESMO horário/profissional → bloqueado
  perform t.fails($q$select public.create_booking(t.id('bizA'), t.id('svcCorte'), t.id('proH'), t.at(3, '14:00'),
      'Cliente B', '19988880002', null, null, '', null)$q$, 'SLOT_UNAVAILABLE', 'B bloqueado no horário de A (mesmo profissional)');
  perform t.su();
  perform t.ok(not exists (select 1 from public.customers c where c.whatsapp = '5519988880002'),
               'a tentativa falha de B não deixa cliente órfão (transação revertida)');
  perform t.anon();
  -- Sobreposição parcial (14:15 não está na grade) e 14:30 livre
  perform t.fails($q$select public.create_booking(t.id('bizA'), t.id('svcCorte'), t.id('proH'), t.at(3, '14:15'),
      'Cliente B', '19988880002', null, null, '', null)$q$, 'SLOT_UNAVAILABLE', '14:15 fora da grade é recusado');
  perform t.ok(not exists (select 1 from public.available_slots(t.id('bizA'), t.id('svcCorte'), t.day(3), t.id('proH'))
                            where starts_at = t.at(3, '14:00')), '14:00 some da lista após a reserva');
  perform t.ok(exists (select 1 from public.available_slots(t.id('bizA'), t.id('svcCorte'), t.day(3), t.id('proH'))
                        where starts_at = t.at(3, '14:30')), '14:30 continua livre');

  -- B agenda com o Gabriel no mesmo horário (permitido) e depois "qualquer" fica sem opção
  r := public.create_booking(t.id('bizA'), t.id('svcCorte'), t.id('proG'), t.at(3, '14:00'),
                             'Cliente B', '19988880002', null, null, '', null);
  perform t.put('apptB', r ->> 'appointment_id'); perform t.put('tokenB', r ->> 'manage_token');
  perform t.put('custB', r ->> 'customer_id');
  perform t.fails($q$select public.create_booking(t.id('bizA'), t.id('svcCorte'), null, t.at(3, '14:00'),
      'Cliente C', '19988880003', null, null, '', null)$q$, 'SLOT_UNAVAILABLE', '"qualquer profissional" sem vaga falha');

  -- "Qualquer": distribui pelo menos ocupado (Gabriel e Henrique têm 1; empate → sort_order → Henrique)
  r := public.create_booking(t.id('bizA'), t.id('svcCorte'), null, t.at(3, '16:00'),
                             'Cliente C', '19988880003', null, null, '', null);
  perform t.put('custC', r ->> 'customer_id');
  perform t.ok((r ->> 'professional_id')::uuid = t.id('proH'), '"qualquer" escolhe Henrique no empate');
  r := public.create_booking(t.id('bizA'), t.id('svcCorte'), null, t.at(3, '16:00'),
                             'Cliente D', '19988880004', null, null, '', null);
  perform t.ok((r ->> 'professional_id')::uuid = t.id('proG'), '"qualquer" cai no Gabriel quando Henrique está ocupado');
  perform t.put('custD', r ->> 'customer_id');
end $$;

-- Regras de horário
do $$
begin
  perform t.anon();
  perform t.fails($q$select public.create_booking(t.id('bizA'), t.id('svcCorte'), t.id('proH'), now() - interval '1 day',
      'X Cliente', '19988880009', null, null, '', null)$q$, 'SLOT_UNAVAILABLE', 'passado é recusado');
  perform t.fails($q$select public.create_booking(t.id('bizA'), t.id('svcCorte'), t.id('proH'), t.at(3, '20:00'),
      'X Cliente', '19988880009', null, null, '', null)$q$, 'SLOT_UNAVAILABLE', 'fora do expediente é recusado');
  perform t.fails($q$select public.create_booking(t.id('bizA'), t.id('svcCorte'), t.id('proH'), t.at(3, '18:45'),
      'X Cliente', '19988880009', null, null, '', null)$q$, 'SLOT_UNAVAILABLE', 'serviço que ultrapassa o fechamento é recusado');
  perform t.fails($q$select public.create_booking(t.id('bizA'), t.id('svcCorte'), t.id('proH'), t.at(90, '10:00'),
      'X Cliente', '19988880009', null, null, '', null)$q$, 'SLOT_UNAVAILABLE', 'além da janela de reserva é recusado');
  perform t.fails($q$select public.create_booking(t.id('bizA'), t.id('svcEsp'), t.id('proH'), t.at(4, '10:00'),
      'X Cliente', '19988880009', null, null, '', null)$q$, 'SLOT_UNAVAILABLE', 'profissional que não faz o serviço é recusado');
  perform t.ok(exists (select 1 from public.available_slots(t.id('bizA'), t.id('svcEsp'), t.day(4), null)
                        where professional_id = t.id('proG')), 'serviço restrito aparece só para o Gabriel');
  perform t.ok(not exists (select 1 from public.available_slots(t.id('bizA'), t.id('svcEsp'), t.day(4), null)
                        where professional_id = t.id('proH')), 'serviço restrito não aparece para o Henrique');
  perform t.fails($q$select public.create_booking(t.id('bizA'), t.id('svcCorte'), t.id('proH'), t.at(4, '10:00'),
      'X', '19988880009', null, null, '', null)$q$, 'VALIDATION', 'nome curto é recusado');
  perform t.fails($q$select public.create_booking(t.id('bizA'), t.id('svcCorte'), t.id('proH'), t.at(4, '10:00'),
      'Fulano', '123', null, null, '', null)$q$, 'VALIDATION', 'WhatsApp inválido é recusado');
  -- Isolamento por tenant: serviço da barbearia B usado na barbearia A
  perform t.fails($q$select public.create_booking(t.id('bizA'), t.id('svcB'), t.id('proH'), t.at(4, '10:00'),
      'Fulano', '19988880009', null, null, '', null)$q$, 'NOT_FOUND', 'serviço de outro tenant não é aceito');
  perform t.fails($q$select public.create_booking(t.id('bizA'), t.id('svcCorte'), t.id('proB'), t.at(4, '10:00'),
      'Fulano', '19988880009', null, null, '', null)$q$, 'NOT_FOUND', 'profissional de outro tenant não é aceito');
end $$;

-- Bloqueio de agenda + preço por dia da semana calculado no servidor
do $$
declare r jsonb; price int;
begin
  perform t.su();
  insert into public.blocked_periods (business_id, professional_id, starts_at, ends_at, kind, reason)
  values (t.id('bizA'), t.id('proH'), t.at(5, '09:00'), t.at(5, '12:00'), 'block', 'médico');
  perform t.anon();
  perform t.fails($q$select public.create_booking(t.id('bizA'), t.id('svcCorte'), t.id('proH'), t.at(5, '10:00'),
      'Fulano', '19988880009', null, null, '', null)$q$, 'SLOT_UNAVAILABLE', 'período bloqueado é recusado');
  perform t.ok(exists (select 1 from public.available_slots(t.id('bizA'), t.id('svcCorte'), t.day(5), t.id('proH'))
                        where starts_at = t.at(5, '12:00')), 'logo após o bloqueio o horário volta a ficar livre');
  r := public.create_booking(t.id('bizA'), t.id('svcPromo'), t.id('proG'), t.at(3, '11:00'),
                             'Cliente E', '19988880005', null, null, '', null);
  perform t.put('custE', r ->> 'customer_id');
  perform t.su();
  select price_cents into price from public.appointments where id = (r ->> 'appointment_id')::uuid;
  perform t.ok(price = 3500, 'preço da promoção do dia (3500) vem do servidor, não do cliente');
  select price_cents into price from public.appointments where id = t.get('apptA')::uuid;
  perform t.ok(price = 4500, 'preço base (4500) para serviço sem regra');
end $$;

-- Cancelar / remarcar por token
do $$
declare r jsonb; ap uuid;
begin
  perform t.anon();
  perform t.fails($q$select public.cancel_booking_by_token('token-invalido')$q$, 'FORBIDDEN', 'token inválido não cancela');
  r := public.get_booking_by_token(t.get('tokenB'));
  perform t.ok(r ->> 'service_name' = 'Corte' and not (r ? 'customer_id'), 'get_booking_by_token não expõe dados de cliente');
  -- remarcar B (Gabriel 14:00) para um horário ocupado do mesmo profissional (16:00 tem o D)
  perform t.fails(format($q$select public.reschedule_booking_by_token(%L, %L)$q$, t.get('tokenB'), t.at(3, '16:00')),
                  'SLOT_UNAVAILABLE', 'remarcar para horário ocupado é recusado');
  perform public.reschedule_booking_by_token(t.get('tokenB'), t.at(3, '15:00'));
  perform t.ok((public.get_booking_by_token(t.get('tokenB')) ->> 'starts_at')::timestamptz = t.at(3, '15:00'),
               'remarcação por token aplicada (15:00)');
  perform t.ok(exists (select 1 from public.available_slots(t.id('bizA'), t.id('svcCorte'), t.day(3), t.id('proG'))
                        where starts_at = t.at(3, '14:00')), 'o horário antigo (14:00) foi liberado');

  -- Cancelar A pelo token libera o horário; segundo cancelamento é recusado; B pode ocupar o lugar
  perform public.cancel_booking_by_token(t.get('tokenA'), 'imprevisto');
  perform t.fails(format($q$select public.cancel_booking_by_token(%L)$q$, t.get('tokenA')), 'INVALID_STATUS', 'cancelar duas vezes é recusado');
  perform t.ok(exists (select 1 from public.available_slots(t.id('bizA'), t.id('svcCorte'), t.day(3), t.id('proH'))
                        where starts_at = t.at(3, '14:00')), 'cancelamento libera o horário de A');
  r := public.create_booking(t.id('bizA'), t.id('svcCorte'), t.id('proH'), t.at(3, '14:00'),
                             'Cliente A', '19988880001', null, null, '', null);   -- A volta (mesmo WhatsApp → mesmo cliente)
  perform t.put('apptA', r ->> 'appointment_id'); perform t.put('tokenA', r ->> 'manage_token');
  perform t.ok(not (r ->> 'is_new_customer')::boolean and (r ->> 'customer_id') = t.get('custA'),
               'mesmo WhatsApp reaproveita o cliente (sem duplicar CRM)');
  perform t.ok((select count(*) from public.available_slots(t.id('bizA'), t.id('svcCorte'), t.day(3), t.id('proH'))) = 18,
               'agenda do Henrique: 20 − 14:00 − 16:00 = 18');
end $$;

-- Janela de cancelamento: 1h antes já não pode (limite padrão 2h). Admin ignora a regra.
do $$
declare r jsonb; tok text; soon timestamptz := date_trunc('minute', now()) + interval '90 minutes';
begin
  perform t.su();
  -- cria direto (como admin do banco) um agendamento em 90 min
  insert into public.appointments (business_id, customer_id, professional_id, service_id, service_name,
     duration_minutes, starts_at, ends_at, status, price_cents, manage_token_hash)
  values (t.id('bizA'), t.get('custC')::uuid, t.id('proG'), t.id('svcCorte'), 'Corte', 30,
          soon, soon + interval '30 minutes', 'confirmed', 4500,
          encode(extensions.digest('token-perto', 'sha256'), 'hex'));
  perform t.anon();
  perform t.fails($q$select public.cancel_booking_by_token('token-perto')$q$, 'TOO_LATE', 'cancelar a menos de 2h é recusado');
  perform t.fails($q$select public.reschedule_booking_by_token('token-perto', now() + interval '3 days')$q$, 'TOO_LATE',
                  'remarcar a menos de 2h é recusado');
end $$;

