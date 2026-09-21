-- =============================================================================
-- Fio do Bigode Barbearia — segurança: RLS, papéis e ledger append-only
--
-- STATUS: PREPARADO, NÃO APLICADO (ver 0001).
--
-- Modelo de acesso (tenant → usuário → role → recurso):
--   anon           → só lê conteúdo público (serviços ativos, equipe ativa, horários,
--                    níveis, recompensas ativas, avaliações publicadas, galeria).
--   authenticated  → cliente: lê APENAS os próprios dados (customers.auth_user_id = auth.uid()).
--                    equipe: business_members define o papel (owner/admin/staff) por barbearia.
--   Escritas sensíveis (agendar, concluir, pontos, resgatar) NÃO são feitas por INSERT/UPDATE
--   direto: só pelas funções SECURITY DEFINER dos arquivos 0003/0004, que revalidam tudo.
-- Nada aqui confia no front-end: alterar um ID no navegador não abre dados de outro tenant.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Funções auxiliares (schema privado "app", não exposto pela API)
-- ---------------------------------------------------------------------------
create or replace function app.is_member(p_business uuid, p_roles public.member_role[] default null)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business
      and m.user_id = (select auth.uid())
      and (p_roles is null or m.role = any (p_roles))
  );
$$;

create or replace function app.is_admin(p_business uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.is_member(p_business, array['owner', 'admin']::public.member_role[]);
$$;

create or replace function app.is_owner(p_business uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.is_member(p_business, array['owner']::public.member_role[]);
$$;

-- IDs de cliente do usuário logado (um mesmo login pode ser cliente em mais de uma barbearia).
create or replace function app.my_customer_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select c.id from public.customers c where c.auth_user_id = (select auth.uid());
$$;

grant usage on schema app to anon, authenticated;
grant execute on function app.is_member(uuid, public.member_role[]) to anon, authenticated;
grant execute on function app.is_admin(uuid) to anon, authenticated;
grant execute on function app.is_owner(uuid) to anon, authenticated;
grant execute on function app.my_customer_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Ledger de pontos: APPEND-ONLY. UPDATE, DELETE e TRUNCATE são bloqueados por trigger.
-- Única exceção: exclusão LGPD do cliente (função delete_customer liga a flag na transação).
-- ---------------------------------------------------------------------------
create or replace function app.ledger_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'loyalty_transactions é append-only: use um lançamento de ajuste.'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and coalesce(current_setting('app.allow_ledger_delete', true), '') = 'on' then
    return old;
  end if;
  raise exception 'loyalty_transactions é append-only: lançamentos não podem ser apagados.'
    using errcode = '42501';
end;
$$;

create trigger loyalty_ledger_no_update_delete
  before update or delete on public.loyalty_transactions
  for each row execute function app.ledger_guard();
create trigger loyalty_ledger_no_truncate
  before truncate on public.loyalty_transactions
  for each statement execute function app.ledger_guard();

-- Saldo e pontos acumulados: sempre derivados do ledger (nunca um número solto).
create or replace view public.customer_balances
with (security_invoker = true) as
select
  t.business_id,
  t.customer_id,
  sum(t.amount)::int as balance,
  coalesce(sum(t.amount) filter (where t.amount > 0 and t.type in ('EARN', 'BONUS', 'ADJUSTMENT')), 0)::int as lifetime_points
from public.loyalty_transactions t
group by t.business_id, t.customer_id;

-- ---------------------------------------------------------------------------
-- Privilégios de tabela: começa fechado e abre só o necessário. (RLS continua valendo.)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- Conteúdo público (somente leitura para visitantes).
grant select on public.businesses, public.business_settings, public.professionals, public.services,
  public.professional_services, public.business_hours, public.loyalty_levels, public.loyalty_rewards,
  public.campaigns, public.public_reviews, public.gallery_images to anon, authenticated;

-- Equipe/cliente logado: leitura (a RLS decide as linhas) ...
grant select on public.business_members, public.blocked_periods, public.customers, public.customer_notes,
  public.appointments, public.appointment_status_history, public.loyalty_transactions,
  public.customer_rewards, public.referrals, public.referral_events, public.campaign_recipients,
  public.message_outbox, public.audit_log, public.customer_balances to authenticated;

-- ... e escrita direta apenas no cadastro/configuração (a RLS restringe a admin/owner).
grant insert, update, delete on public.professionals, public.services, public.professional_services,
  public.business_hours, public.blocked_periods, public.loyalty_levels, public.loyalty_rewards,
  public.campaigns, public.public_reviews, public.gallery_images to authenticated;
grant update on public.businesses, public.business_settings to authenticated;
grant insert, update, delete on public.business_members to authenticated;
grant insert, update on public.customers to authenticated;          -- equipe cadastra/edita clientes
grant insert, delete on public.customer_notes to authenticated;     -- observações internas
grant insert, delete on public.campaign_recipients to authenticated; -- "marcar como enviado"
-- Sem escrita direta em: appointments, loyalty_transactions, customer_rewards, referrals,
-- referral_events, appointment_status_history, message_outbox, audit_log (só via funções).

-- ---------------------------------------------------------------------------
-- RLS em TODAS as tabelas
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- businesses -----------------------------------------------------------------
create policy businesses_public_read on public.businesses for select to anon, authenticated using (true);
create policy businesses_admin_update on public.businesses for update to authenticated
  using ((select app.is_admin(id))) with check ((select app.is_admin(id)));

-- business_members: cada um vê o próprio vínculo; owner gerencia a equipe --------
create policy members_read on public.business_members for select to authenticated
  using (user_id = (select auth.uid()) or (select app.is_admin(business_id)));
create policy members_owner_insert on public.business_members for insert to authenticated
  with check ((select app.is_owner(business_id)));
create policy members_owner_update on public.business_members for update to authenticated
  using ((select app.is_owner(business_id))) with check ((select app.is_owner(business_id)));
create policy members_owner_delete on public.business_members for delete to authenticated
  using ((select app.is_owner(business_id)));

-- business_settings ------------------------------------------------------------
create policy settings_public_read on public.business_settings for select to anon, authenticated using (true);
create policy settings_admin_update on public.business_settings for update to authenticated
  using ((select app.is_admin(business_id))) with check ((select app.is_admin(business_id)));

-- catálogo: público lê ativos; equipe lê tudo; admin escreve ----------------------
create policy professionals_public_read on public.professionals for select to anon, authenticated
  using (active or (select app.is_member(business_id)));
create policy professionals_admin_write on public.professionals for all to authenticated
  using ((select app.is_admin(business_id))) with check ((select app.is_admin(business_id)));

create policy services_public_read on public.services for select to anon, authenticated
  using (active or (select app.is_member(business_id)));
create policy services_admin_write on public.services for all to authenticated
  using ((select app.is_admin(business_id))) with check ((select app.is_admin(business_id)));

create policy prof_services_public_read on public.professional_services for select to anon, authenticated using (true);
create policy prof_services_admin_write on public.professional_services for all to authenticated
  using ((select app.is_admin(business_id))) with check ((select app.is_admin(business_id)));

create policy hours_public_read on public.business_hours for select to anon, authenticated using (true);
create policy hours_admin_write on public.business_hours for all to authenticated
  using ((select app.is_admin(business_id))) with check ((select app.is_admin(business_id)));

-- Bloqueios podem ter motivo interno: só equipe lê (o público usa available_slots).
create policy blocks_staff_read on public.blocked_periods for select to authenticated
  using ((select app.is_member(business_id)));
create policy blocks_admin_write on public.blocked_periods for all to authenticated
  using ((select app.is_admin(business_id))) with check ((select app.is_admin(business_id)));

-- customers: equipe do MESMO tenant; cliente só a si mesmo -------------------------
create policy customers_staff_read on public.customers for select to authenticated
  using ((select app.is_member(business_id)));
create policy customers_self_read on public.customers for select to authenticated
  using (auth_user_id = (select auth.uid()));
create policy customers_staff_insert on public.customers for insert to authenticated
  with check ((select app.is_member(business_id)));
create policy customers_staff_update on public.customers for update to authenticated
  using ((select app.is_member(business_id))) with check ((select app.is_member(business_id)));
-- (exclusão/anonimização: função delete_customer, restrita a admin)

-- customer_notes: INTERNAS. Nenhuma policy para o cliente → ele nunca as vê. -------
create policy notes_staff_read on public.customer_notes for select to authenticated
  using ((select app.is_member(business_id)));
create policy notes_staff_insert on public.customer_notes for insert to authenticated
  with check ((select app.is_member(business_id)) and author_id = (select auth.uid()));
create policy notes_admin_delete on public.customer_notes for delete to authenticated
  using ((select app.is_admin(business_id)));

-- appointments: equipe do tenant; cliente só os próprios --------------------------
create policy appointments_staff_read on public.appointments for select to authenticated
  using ((select app.is_member(business_id)));
create policy appointments_self_read on public.appointments for select to authenticated
  using (customer_id in (select app.my_customer_ids()));

create policy history_staff_read on public.appointment_status_history for select to authenticated
  using ((select app.is_member(business_id)));

-- fidelidade ---------------------------------------------------------------------
create policy ledger_staff_read on public.loyalty_transactions for select to authenticated
  using ((select app.is_member(business_id)));
create policy ledger_self_read on public.loyalty_transactions for select to authenticated
  using (customer_id in (select app.my_customer_ids()));

create policy levels_public_read on public.loyalty_levels for select to anon, authenticated using (true);
create policy levels_admin_write on public.loyalty_levels for all to authenticated
  using ((select app.is_admin(business_id))) with check ((select app.is_admin(business_id)));

create policy rewards_public_read on public.loyalty_rewards for select to anon, authenticated
  using (active or (select app.is_member(business_id)));
create policy rewards_admin_write on public.loyalty_rewards for all to authenticated
  using ((select app.is_admin(business_id))) with check ((select app.is_admin(business_id)));

create policy customer_rewards_staff_read on public.customer_rewards for select to authenticated
  using ((select app.is_member(business_id)));
create policy customer_rewards_self_read on public.customer_rewards for select to authenticated
  using (customer_id in (select app.my_customer_ids()));

create policy referrals_staff_read on public.referrals for select to authenticated
  using ((select app.is_member(business_id)));
create policy referrals_self_read on public.referrals for select to authenticated
  using (referrer_id in (select app.my_customer_ids()));

create policy referral_events_staff_read on public.referral_events for select to authenticated
  using (exists (select 1 from public.referrals r where r.id = referral_id and (select app.is_member(r.business_id))));

-- campanhas / mensagens / conteúdo ---------------------------------------------------
create policy campaigns_public_read on public.campaigns for select to anon, authenticated
  using (active or (select app.is_member(business_id)));
create policy campaigns_admin_write on public.campaigns for all to authenticated
  using ((select app.is_admin(business_id))) with check ((select app.is_admin(business_id)));

create policy recipients_staff_read on public.campaign_recipients for select to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and (select app.is_member(c.business_id))));
create policy recipients_staff_insert on public.campaign_recipients for insert to authenticated
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and (select app.is_member(c.business_id))));
create policy recipients_staff_delete on public.campaign_recipients for delete to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and (select app.is_admin(c.business_id))));

create policy outbox_staff_read on public.message_outbox for select to authenticated
  using ((select app.is_member(business_id)));

create policy reviews_public_read on public.public_reviews for select to anon, authenticated
  using (published or (select app.is_member(business_id)));
create policy reviews_admin_write on public.public_reviews for all to authenticated
  using ((select app.is_admin(business_id))) with check ((select app.is_admin(business_id)));

create policy gallery_public_read on public.gallery_images for select to anon, authenticated using (true);
create policy gallery_admin_write on public.gallery_images for all to authenticated
  using ((select app.is_admin(business_id))) with check ((select app.is_admin(business_id)));

create policy audit_admin_read on public.audit_log for select to authenticated
  using ((select app.is_admin(business_id)));
