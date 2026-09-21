#!/usr/bin/env bash
# Roda as migrations + testes em um banco LOCAL descartável (nunca em Supabase).
# Uso: PGHOST=localhost PGUSER=postgres PGPASSWORD=... ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${TEST_DB:-fdb_test}
case "${PGHOST:-localhost}" in localhost|127.0.0.1|/*) ;; *) echo "Recusado: só roda em banco local."; exit 1;; esac
export PGOPTIONS='--client-min-messages=warning'
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
P="psql -q -v ON_ERROR_STOP=1 -d $DB"
$P -f tests/00_auth_stub.sql
for f in migrations/*.sql; do echo "→ $f"; $P -f "$f"; done
for f in tests/[1-9]*.sql; do echo "→ $f"; $P -f "$f"; done
bash tests/90_concurrency.sh
echo "OK: migrations aplicadas e testes SQL passaram (banco local $DB)."
