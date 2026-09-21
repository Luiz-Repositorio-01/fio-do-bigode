#!/usr/bin/env bash
# Concorrência REAL (sessões paralelas) contra o banco local de teste:
#  1) 8 clientes disputam o MESMO horário/profissional → exatamente 1 vence;
#  2) 3 clientes disputam "qualquer profissional" com 2 profissionais → 2 vencem, 1 é recusado;
#  3) 6 resgates simultâneos com saldo para apenas 1 → exatamente 1 vence (sem gastar o saldo duas vezes);
#  4) 5 conclusões simultâneas do mesmo atendimento → pontos lançados uma única vez.
set -uo pipefail
DB=${TEST_DB:-fdb_test}
Q="psql -X -q -t -A -d $DB"
id() { $Q -c "select id from t.k where name = '$1'"; }
BIZ=$(id bizA); SVC=$(id svcCorte); PROH=$(id proH); PROG=$(id proG)
fail() { echo "FALHOU: $*"; exit 1; }

# barreira: o "portão" é um advisory lock exclusivo; os workers esperam nele e disparam juntos.
run_parallel() {  # $1 = N; demais = SQL por worker (usa {i})
  local n=$1; shift; local sql=$1; local tmp; tmp=$(mktemp -d)
  ( $Q -c "select pg_advisory_lock(9001); select pg_sleep(2.5)" >/dev/null ) &
  local gate=$!
  sleep 0.5
  for i in $(seq 1 "$n"); do
    ( $Q -c "select pg_advisory_lock_shared(9001); ${sql//\{i\}/$i}" >"$tmp/$i.out" 2>"$tmp/$i.err"; echo $? >"$tmp/$i.rc" ) &
  done
  wait
  RESULT_DIR=$tmp
}
ok_count() { local c=0; for f in "$RESULT_DIR"/*.rc; do [ "$(cat "$f")" = 0 ] && c=$((c+1)); done; echo $c; }

DAY=$($Q -c "select (now() at time zone 'America/Sao_Paulo')::date + 12")
WHEN="(('$DAY'::date + time '10:00') at time zone 'America/Sao_Paulo')"

# 1) mesmo horário, mesmo profissional
run_parallel 8 "set role anon; select public.create_booking('$BIZ','$SVC','$PROH',$WHEN,'Corredor {i}','1996660000{i}',null,null,'',null);"
W=$(ok_count); [ "$W" = 1 ] || fail "corrida pelo mesmo horário: $W vencedores (esperado 1)"
N=$($Q -c "select count(*) from public.appointments where professional_id='$PROH' and starts_at = $WHEN and status <> 'cancelled'")
[ "$N" = 1 ] || fail "banco tem $N agendamentos no mesmo horário"
grep -qh "acabou de ser ocupado" "$RESULT_DIR"/*.err || fail "mensagem esperada ausente"
echo "ok - 8 disputas pelo mesmo horário: 1 venceu, 7 receberam 'horário ocupado'"

# 2) "qualquer profissional": 2 vagas, 3 clientes
WHEN2="(('$DAY'::date + time '11:00') at time zone 'America/Sao_Paulo')"
run_parallel 3 "set role anon; select public.create_booking('$BIZ','$SVC',null,$WHEN2,'Qualquer {i}','1995550000{i}',null,null,'',null);"
W=$(ok_count); [ "$W" = 2 ] || fail "qualquer profissional: $W vencedores (esperado 2)"
D=$($Q -c "select count(distinct professional_id) from public.appointments where starts_at = $WHEN2 and status <> 'cancelled'")
[ "$D" = 2 ] || fail "os 2 vencedores deveriam ter profissionais diferentes"
echo "ok - 3 clientes x 2 profissionais ('qualquer'): 2 atendidos em profissionais distintos, 1 recusado"

# 3) resgates simultâneos: B tem saldo para UM resgate de 40 pontos
$Q -c "insert into public.loyalty_rewards (id, business_id, name, cost_points) values (gen_random_uuid(), '$BIZ', 'Resgate concorrente', 40)"
RW=$($Q -c "select id from public.loyalty_rewards where name = 'Resgate concorrente'")
UB=$(id userB)
BAL=$($Q -c "select balance from public.customer_balances where customer_id = '$(id userB >/dev/null; $Q -c "select id from public.customers where auth_user_id = '$UB'")'")
[ "$BAL" -ge 40 ] && [ "$BAL" -lt 80 ] || fail "pré-condição: saldo de B = $BAL (esperado entre 40 e 79)"
run_parallel 6 "select set_config('request.jwt.claim.sub','$UB',false); set role authenticated; select public.redeem_reward('$RW');"
W=$(ok_count); [ "$W" = 1 ] || fail "resgates simultâneos: $W vencedores (esperado 1)"
NEG=$($Q -c "select count(*) from public.customer_balances where balance < 0")
[ "$NEG" = 0 ] || fail "saldo negativo após resgates simultâneos"
echo "ok - 6 resgates simultâneos com saldo para 1: 1 venceu, saldo nunca ficou negativo"

# 4) concluir o mesmo atendimento em paralelo
AP=$($Q -c "select id from public.appointments where professional_id='$PROH' and starts_at = $WHEN and status='confirmed'")
AD=$(id adminA)
run_parallel 5 "select set_config('request.jwt.claim.sub','$AD',false); set role authenticated; select public.admin_complete_appointment('$AP', 4500);"
W=$(ok_count); [ "$W" = 1 ] || fail "conclusões simultâneas: $W vencedores (esperado 1)"
N=$($Q -c "select count(*) from public.loyalty_transactions where reference_type='appointment' and reference_id='$AP'")
[ "$N" = 1 ] || fail "pontos lançados $N vezes"
echo "ok - 5 conclusões simultâneas do mesmo atendimento: pontos lançados 1 vez"
echo "OK: testes de concorrência passaram."
