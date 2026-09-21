# Banco de dados (Supabase / PostgreSQL) — PREPARADO, NÃO APLICADO

> **Status:** as migrations em `supabase/migrations/` foram escritas e testadas **somente em um
> PostgreSQL 16 local descartável**. **Não foram aplicadas em nenhum projeto Supabase** (nem no de
> staging, nem em produção, nem nos projetos de outros produtos). A versão entregue ao cliente é
> uma **demonstração** que guarda tudo no `localStorage` do navegador. A migração para o banco real
> só deve acontecer **depois da aprovação do cliente** e com autorização explícita.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `0001_schema.sql` | Tabelas, enums, FKs compostas `(business_id, id)`, índices, **exclusion constraint** anti-double-booking |
| `0002_rls.sql` | Funções `app.is_member/is_admin/is_owner/my_customer_ids`, **RLS em todas as tabelas**, privilégios mínimos, ledger **append-only**, view `customer_balances` |
| `0003_rpc_booking.sql` | `available_slots/available_days`, `create_booking`, cancelar/remarcar (token, cliente logado, painel), `claim_my_customer` |
| `0004_rpc_loyalty.sql` | Concluir atendimento (visita + pontos + indicação), resgate, ajuste, benefícios, exclusão LGPD, expiração, aniversário, rotinas diárias |
| `0005_storage.sql` | Bucket `site` (fotos públicas) com escrita restrita ao admin da própria barbearia (só age se o Storage existir) |
| `tests/` | `00_auth_stub.sql` (simula `auth`), `10–40_*.sql` (147 verificações), `90_concurrency.sh` (sessões paralelas), `run.sh` |

## Modelo multi-tenant

`businesses (tenant) → business_members (role: owner/admin/staff) → recursos com business_id`.
Clientes finais não entram em `business_members`: `customers.auth_user_id` liga o login (Supabase Auth)
ao cadastro do CRM daquela barbearia. Toda tabela de negócio tem `business_id` e FK composta com
`customers/professionals/services`, então **não é possível** apontar um agendamento da barbearia A para
um cliente/serviço da B nem por engano.

## O que cada papel pode

| Papel | Lê | Escreve direto | Escreve via RPC |
|---|---|---|---|
| `anon` (visitante) | serviços/equipe ativos, horários, níveis, recompensas ativas, avaliações publicadas, galeria, configurações | nada | `available_slots`, `available_days`, `create_booking`, `get/cancel/reschedule_booking_by_token` |
| Cliente logado | **só o próprio** cadastro, agendamentos, extrato, benefícios, indicações | nada | `cancel_my_appointment`, `reschedule_my_appointment`, `update_my_profile`, `redeem_reward`, `claim_my_customer` |
| `staff` | tudo da própria barbearia (inclui observações internas) | clientes, observações | criar/confirmar/cancelar/remarcar/faltou/concluir, dar cortesia, marcar benefício usado |
| `admin` / `owner` | idem | catálogo, horários, bloqueios, níveis, recompensas, campanhas, site, configurações | + ajustar pontos, cancelar benefício, **excluir cliente (LGPD)**, rotinas diárias |
| `owner` | — | equipe (`business_members`) | — |

Nunca há `INSERT/UPDATE` direto em `appointments`, `loyalty_transactions`, `customer_rewards`,
`referrals`, `appointment_status_history`, `audit_log` — só pelas funções `SECURITY DEFINER`, que
revalidam papel, tenant, status e regras. **As observações internas do CRM não têm nenhuma policy
para o cliente** (ele nunca as recebe, nem por API).

## Garantias no próprio banco (independem da aplicação)

- **Sem double booking:** `appointments_no_overlap` (GiST + `tstzrange`) para status pending/confirmed/completed.
  Em "qualquer profissional", se uma corrida estourar a constraint a função tenta o próximo profissional.
- **Ledger append-only:** trigger bloqueia UPDATE, DELETE e TRUNCATE (até para o dono do banco).
  Única exceção: `admin_delete_customer` (LGPD) liga um flag válido só na transação.
- **Saldo = soma do ledger** (`customer_balances`); nunca um número solto. Correções = lançamento `ADJUSTMENT`.
- **Idempotência:** índice único em (business, type, reference) → concluir duas vezes ou rodar a rotina
  duas vezes não duplica pontos/bônus.
- **Resgate sem gasto duplo:** trava a linha do cliente e da recompensa (`FOR UPDATE`).
- **Token do link de gerenciamento:** 192 bits aleatórios; no banco só o SHA-256.
- **Preço/duração/profissional/disponibilidade** sempre recalculados no servidor.

## Como testar localmente (sem tocar em Supabase)

```bash
# precisa de um PostgreSQL 16 LOCAL com a extensão btree_gist/pgcrypto disponíveis
export PGHOST=localhost PGUSER=postgres PGPASSWORD=...   # o script RECUSA hosts não locais
./supabase/tests/run.sh
```

O script recria o banco `fdb_test`, aplica as 5 migrations e roda os testes. Resultado da última execução:
**147 verificações SQL + 4 cenários de concorrência real, todos passando.**

## O que os testes cobrem

Cliente A agenda 14:00 e cliente B é bloqueado no mesmo horário/profissional; "qualquer profissional";
fora do expediente/passado/janela/grade/bloqueio/profissional que não faz o serviço; serviço ou profissional
de outro tenant; preço por dia da semana; cancelar/remarcar por token e janela mínima; concluir → visita →
pontos; valor final manual e serviço "Consultar"; campanhas (2x e bônus); resgate, estoque e saldo insuficiente;
uso do benefício; ajuste manual com auditoria; indicação (só no 1º atendimento, limite mensal); expiração
respeitando débitos; aniversário; exclusão LGPD; **RLS** (anon, cliente A × B, staff × admin, tenant A × B,
notas internas invisíveis ao cliente); ledger imutável; exclusion constraint direta; concorrência real
(8 disputas pelo mesmo horário → 1 vence; resgates e conclusões simultâneos → 1 efeito).

## PENDENTE antes de usar em produção (honesto)

1. **Aplicar no projeto Supabase DEDICADO da barbearia** — depende de aprovação do cliente e de autorização
   sua. (Os projetos `conexa360*` são de outro produto e não foram tocados.)
2. **Storage real:** `0005_storage.sql` foi validado só contra um *stub* do Storage; conferir no Supabase real.
3. **Login do cliente (OTP):** `claim_my_customer` exige WhatsApp **confirmado** em `auth.users.phone`.
   Isso exige provedor de SMS (ex.: Twilio) configurado no Supabase Auth — tem custo. WhatsApp OTP não é nativo.
   Decisão de produto/custo a tomar com o cliente. Sem isso, o cliente usa apenas o **link secreto** do agendamento.
4. **Anti-abuso na borda:** `create_booking` é público. O banco limita 5 horários futuros por cliente, mas
   rate-limit por IP e CAPTCHA (ex.: Cloudflare Turnstile) precisam ser configurados no deploy.
5. **Agendador das rotinas:** `run_daily_jobs()` (expiração + aniversário) precisa ser chamado 1×/dia por
   `pg_cron` ou Edge Function agendada com `service_role`. Não foi configurado.
6. **Lembretes automáticos:** a tabela `message_outbox` está pronta, mas **nada a consome**. Hoje os lembretes
   são enviados manualmente por links `wa.me` no painel. Automatizar exige WhatsApp Business API (contratação).
7. **Seed inicial real:** durações, preços e regras de fidelidade **não foram confirmados** pela barbearia;
   gerar o seed só depois da confirmação.
8. **Fuso horário:** `businesses.timezone` (padrão `America/Sao_Paulo`) é usado nos cálculos; o front da demo
   usa UTC−03:00 fixo (o Brasil não tem horário de verão desde 2019).
9. **Arredondamento de pontos:** o SQL usa `numeric` (exato); o front usa ponto flutuante. Podem divergir em
   centavos raros; em produção vale o SQL.
10. **Rodar os *advisors* do Supabase** (segurança/performance) depois de aplicar em um branch/projeto de teste.
