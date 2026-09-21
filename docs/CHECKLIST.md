# Checklist final — Fio do Bigode Barbearia

Legenda: **OK** = feito e verificado · **DEMO** = funciona na demonstração (dados no navegador), versão real preparada mas não ativada · **PENDENTE** = não feito (motivo, como resolver, se bloqueia o lançamento).

Verificações executadas nesta entrega: `tsc` limpo · `eslint` limpo · 67 testes unitários · `next build` ok · e2e 8/8 · responsivo 26 rotas × 9 larguras sem overflow · SQL local: 147 verificações + 4 cenários de concorrência real.

## Presença digital e dados

| Item | Status | Observação |
|---|---|---|
| Auditoria Instagram/Avec/Google | OK | Fontes em `src/config/seed.ts`; nada inventado |
| Serviços e preços, endereço, WhatsApp, horário | OK | Vieram do Avec/Instagram públicos |
| Duração real de cada serviço | PENDENTE | Não publicada. Usei valores provisórios marcados "não confirmado" no painel. Resolver: barbearia informar. **Não bloqueia demo; bloqueia lançamento** |
| Fotos, logo, foto dos barbeiros | DEMO | Logo e imagens copiados do Instagram oficial da barbearia (autorizado pelo desenvolvedor para a demo). Retratos da equipe parecem gerados por IA. Resolver: confirmar autorização de uso com a barbearia e trocar por fotos reais. Bloqueia lançamento |
| Bio/especialidades dos barbeiros, avaliações próprias | PENDENTE | Não encontradas. Resolver: barbearia informar. Não bloqueia |
| Regras de fidelidade (pontos/níveis/recompensas) | DEMO | Valores de exemplo editáveis; a barbearia não os definiu. Bloqueia lançamento (decisão do cliente) |
| Avaliações do Avec no JSON-LD | OK (omitido de propósito) | Autoavaliação não é aceita pelo Google |

## Site público, SEO, performance

| Item | Status | Observação |
|---|---|---|
| Páginas: início, serviços, barbeiros, galeria, sobre, contato, fidelidade, agendar, indique, privacidade, termos | OK | |
| Agendamento 4 passos, "qualquer barbeiro", .ics, link cancelar/remarcar | DEMO | |
| SEO: metadata, sitemap, robots, JSON-LD, breadcrumbs, noindex em /admin e /minha-conta | OK | `NEXT_PUBLIC_SITE_URL` deve ser definido no deploy (hoje `localhost`). A demo é noindex por padrão; no lançamento definir `NEXT_PUBLIC_ALLOW_INDEXING=true` |
| Analytics por variável de ambiente | OK | Sem ID nada carrega |
| Cabeçalhos de segurança (nosniff, frame DENY, HSTS, referrer, permissions) | OK | |
| CSP completa | PENDENTE | Depende dos scripts de analytics escolhidos. Não bloqueia |
| Lighthouse / Core Web Vitals medidos | PENDENTE | Não medi com ferramenta. Bundle estático total 2,0 MB (45 chunks), páginas pré-renderizadas. Medir após deploy. Não bloqueia |
| Acessibilidade: roles, foco, labels, contraste por tokens | OK (revisão manual) | Auditoria automatizada (axe) não rodada |

## Painel, CRM, fidelidade

| Item | Status | Observação |
|---|---|---|
| Dashboard, agenda (dia/semana/mês), agendamentos, clientes, serviços, barbeiros, horários, bloqueios, fidelidade, recompensas, campanhas, configurações, galeria | DEMO | |
| CRM: segmentos, histórico, observações internas (nunca ao cliente), CSV, exclusão LGPD | DEMO | RLS impede o cliente de ver as notas (testado no SQL) |
| Ledger de pontos append-only, saldo = soma, idempotência, resgate sem gasto duplo | DEMO + OK no SQL | Testado com sessões paralelas |
| Indicação (só após 1º atendimento, limite mensal), aniversário, expiração | DEMO + OK no SQL | |
| Teste obrigatório: A agenda 14:00, B é bloqueado | OK | e2e + SQL + concorrência (8 disputas → 1 vence) |
| Teste obrigatório: concluir → visita → pontos → resgate | OK | e2e + SQL |

## WhatsApp

| Item | Status | Observação |
|---|---|---|
| Links `wa.me` com templates editáveis (confirmação, lembrete, reativação, aniversário…) | OK | Envio é **manual**, pelo painel |
| Envio automático / lembretes automáticos | PENDENTE | Exige WhatsApp Business API (contratação, custo, templates aprovados pela Meta). Tabela `message_outbox` pronta. Não bloqueia lançamento (operação manual funciona) |

## Backend real (produção)

| Item | Status | Observação |
|---|---|---|
| Migrations (schema, RLS, RPCs, storage) | OK (escritas e testadas em PG16 local) | **Não aplicadas em nenhum Supabase** |
| Aplicar no Supabase da barbearia | PENDENTE | Precisa de projeto **dedicado** + sua autorização. Os projetos `conexa360*` não foram tocados. Bloqueia lançamento |
| Trocar demo por Supabase no front (`api.ts`, store, sessão) | PENDENTE | Mapa de troca no README. Bloqueia lançamento |
| Login de cliente por OTP | PENDENTE | Requer SMS (Twilio) no Supabase Auth ou WhatsApp API; decisão/custo. Hoje o login demo **não verifica nada** — nunca publicar assim. Bloqueia lançamento |
| Login da equipe (Supabase Auth + `business_members`) | PENDENTE | Hoje é botão de demonstração. Bloqueia lançamento |
| CAPTCHA / rate limit em `create_booking` | PENDENTE | Configurar na borda (Turnstile/Vercel). Bloqueia lançamento |
| Agendar `run_daily_jobs()` | PENDENTE | pg_cron ou Edge Function. Não bloqueia (pode rodar pelo painel) |
| Storage real | PENDENTE | Validado só contra stub. Conferir no Supabase real |
| Advisors do Supabase | PENDENTE | Rodar após aplicar em ambiente de teste |
| Seed real | PENDENTE | Gerar após confirmação de durações/preços |

## Deploy e Git

| Item | Status | Observação |
|---|---|---|
| Deploy / `git push` / migration em produção | **NÃO EXECUTADO** (por regra) | Só com sua ordem explícita |
| Commit | NÃO EXECUTADO | Alterações estão no working tree (repo tem só o commit inicial do create-next-app) |
| Domínio, Search Console, Google Meu Negócio | PENDENTE | Dependem do cliente |
| Política de privacidade/termos revisadas por advogado | PENDENTE | Texto-base; revisar antes do lançamento. Bloqueia lançamento |
| Termos do Avec (migração/integração) | PENDENTE | Não copiei conteúdo/estrutura do Avec; se for substituí-lo, checar dados dos clientes atuais e contrato |
