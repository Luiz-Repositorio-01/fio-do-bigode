# Fio do Bigode Barbearia — site, agendamento, CRM, fidelidade e painel (Piracicaba)

> ## ⚠️ VERSÃO DE DEMONSTRAÇÃO
> Enquanto o cliente não aprova o produto, **nada é real**: os dados ficam **somente no
> `localStorage` do navegador** de quem abre o site; não há banco, e-mail, WhatsApp automático nem
> pagamento. O login é **sem verificação** (só para demonstrar as telas). Não use com dados reais de clientes.
> O banco de produção (Supabase) está **preparado e testado localmente, mas não aplicado** — ver
> [`docs/DATABASE.md`](docs/DATABASE.md). **Nada foi publicado (deploy/push).**

## O que existe

**Site público:** Início · Serviços · Barbeiros · Galeria · Sobre · Contato · Fidelidade · Agendar (4 passos:
serviço → barbeiro/horário → dados → confirmação, com "qualquer barbeiro", calendário `.ics` e links de
cancelar/remarcar por token) · Indique um amigo (`/indique/[codigo]`) · Privacidade e Termos (LGPD).
**Área do cliente** (`/minha-conta`): agendamentos, histórico, pontos/nível/extrato/resgate, benefícios com código, dados.
**Painel** (`/admin`): dashboard, agenda (dia por barbeiro / semana / mês), agendamentos, clientes (CRM com segmentos,
observações internas nunca exibidas ao cliente, exportar CSV, exclusão LGPD), serviços (preço por dia da semana),
barbeiros e horários, fidelidade (regras e níveis), recompensas, campanhas + lista de envio, configurações, galeria/avaliações.
**WhatsApp:** somente links `wa.me` com mensagem pronta (templates editáveis). **Não há envio automático.**
**SEO:** metadata por página, `sitemap.xml`, `robots.txt`, JSON-LD `BarberShop`/breadcrumbs, `/admin` e `/minha-conta` com `noindex`.

## Rodar

```bash
npm install
npm run dev            # http://localhost:3000   (admin demo: /admin → "Entrar como demonstração")
npm run check          # tsc + eslint + vitest + build
npm run e2e            # fluxos ponta a ponta (Playwright, precisa de Chromium e de `npm run start`/dev)
npm run e2e:responsive # 26 rotas × 9 larguras, sem overflow horizontal
./supabase/tests/run.sh # migrations + testes SQL/concorrência em PostgreSQL LOCAL
```

Variáveis: ver [`.env.example`](.env.example) (todas opcionais na demo).

## Arquitetura (pensada para trocar a demo pelo backend real sem reescrever a UI)

```
src/domain      regras puras (disponibilidade, preços, pontos, segmentos, mensagens, relatórios, calendário)
src/services    transições de estado puras = o que vira RPC/transaction no banco (booking, loyalty, admin)
src/lib/store   armazenamento local (demo) + sessão insegura de demonstração
src/lib/api.ts  camada assíncrona "servidor" — é AQUI que entram Supabase/Server Actions
src/features    telas (public, booking, account, admin)  ·  src/app  rotas Next.js (App Router)
supabase/       migrations (não aplicadas) + testes SQL  ·  e2e/  Playwright
```

A disponibilidade (`evaluateSlot/computeSlots`) é a **fonte única**: a UI usa e `createBooking` revalida. No SQL o
equivalente é `app.slot_rejection` + exclusion constraint.

### Mapa de troca (demo → produção)

| `api.*` (demo) | Produção (RPC do Supabase) |
|---|---|
| lista de horários / dias livres | `available_slots`, `available_days` |
| `createBooking` | `create_booking` (público) / `admin_create_booking` |
| `cancelAppointment` / `rescheduleAppointment` | `*_by_token`, `*_my_appointment`, `admin_cancel/reschedule_appointment` |
| `confirmAppointment`, `markNoShow` | `admin_confirm_appointment`, `admin_mark_no_show` |
| `completeAppointment` | `admin_complete_appointment` (visita + pontos + indicação) |
| `redeemReward`, `useReward` | `redeem_reward`, `admin_mark_reward_used` |
| `adjustPoints` | `admin_adjust_points` |
| `deleteCustomer` (LGPD) | `admin_delete_customer` |
| `runMaintenance` | `admin_run_daily_jobs` / `run_daily_jobs` (agendado) |
| sessão demo | Supabase Auth + `claim_my_customer` (OTP) e `business_members` (equipe) |
| CRUDs simples do painel (`api.admin`) | queries diretas protegidas por RLS (serviços, horários, níveis, campanhas, …) |

## Fidelidade (configurável no painel, nada chumbado)

Modelos: pontos por R$, por visita, ou por número de visitas (recompensa automática); arredondamento; validade dos pontos;
níveis (por pontos acumulados — resgatar não rebaixa); recompensas com estoque/validade; campanhas (multiplicador/bônus);
indicação (pontos só quando o indicado conclui o 1º atendimento, com limite mensal); aniversário. Tudo passa por um
**ledger append-only** (saldo = soma). **Os valores padrão de pontos/níveis/recompensas são exemplos editáveis — a barbearia ainda não os definiu.**

## Dados que NÃO foram inventados

Preços e nomes de serviços, endereço, WhatsApp e horários vêm do Avec/Instagram públicos da barbearia
(fontes em `src/config/seed.ts`). **Marcados como [INFORMAÇÃO NÃO ENCONTRADA]/não confirmados:** duração real de cada
serviço, foto/logo, bio e especialidades dos barbeiros, regras de fidelidade, avaliações próprias. Fotos **não foram
baixadas**; suba pela galeria do painel (ou autorize o download).

## Deploy (não executado)

Não houve `git push`, deploy nem migration em produção. Para colocar no ar (após aprovação e com sua autorização):
1. Criar projeto Supabase **dedicado** → aplicar `supabase/migrations/*` → conferir advisors.
2. Trocar `src/lib/api.ts` e o store pelos RPCs/queries (mapa acima); ativar Supabase Auth (equipe por e-mail; cliente por OTP).
3. Configurar `.env` na Vercel; CAPTCHA/rate limit; agendar `run_daily_jobs()`; domínio + Search Console.

## Manutenção

Regras de negócio vivem em `src/domain` + `src/services` (e espelhadas em SQL). Alterou uma regra? Atualize os dois e os
testes (`npm test` e `supabase/tests`). Toda mudança de banco = nova migration numerada; nunca editar as já aplicadas.
