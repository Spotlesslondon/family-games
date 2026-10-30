#!/usr/bin/env bash
# Runs the migrations and the SQL tests against a throwaway local Postgres.
# Needs the Postgres server binaries on the machine (initdb, pg_ctl, psql).
# Postgres refuses to run as root, so when invoked as root this re-runs itself
# as the postgres user.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || ls /usr/lib/postgresql/*/bin/pg_ctl | tail -1)")}"
PORT="${PGTEST_PORT:-54329}"
DATA="${PGTEST_DATA:-/tmp/family-games-pgtest}"

if [ "$(id -u)" = "0" ]; then
  chmod -R a+rX "$ROOT/supabase" "$ROOT/scripts"
  exec su postgres -s /bin/bash -c "PGBIN='$PGBIN' PGTEST_PORT='$PORT' PGTEST_DATA='$DATA' bash '$ROOT/scripts/db-test.sh'"
fi

cleanup() {
  "$PGBIN/pg_ctl" -D "$DATA" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$DATA"
}
trap cleanup EXIT

rm -rf "$DATA"
"$PGBIN/initdb" -D "$DATA" -A trust -U postgres >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -l "$DATA/log" start >/dev/null

PSQL=("$PGBIN/psql" -v ON_ERROR_STOP=1 -q -h "$DATA" -p "$PORT" -U postgres)

"${PSQL[@]}" -d postgres -c "create database family_games_test" >/dev/null

echo "shim:       supabase/tests/00_local_supabase_shim.sql"
"${PSQL[@]}" -d family_games_test -f "$ROOT/supabase/tests/00_local_supabase_shim.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migration:  $(basename "$f")"
  "${PSQL[@]}" -d family_games_test -f "$f"
done

for f in "$ROOT"/supabase/tests/0[1-9]*.sql; do
  echo "test:       $(basename "$f")"
  "${PSQL[@]}" -d family_games_test -f "$f"
done

echo "db:test passed"
