#!/bin/sh
set -eu

image=${1:?built image reference required}
sha=${2:?expected app SHA required}
network=$(docker network create "dorm-container-check-$$")
db=
app=
cleanup() {
  if [ -n "$app" ]; then docker rm -f "$app" >/dev/null 2>&1 || true; fi
  if [ -n "$db" ]; then docker rm -f "$db" >/dev/null 2>&1 || true; fi
  docker network rm "$network" >/dev/null
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
db=$(docker run -d --network "$network" --network-alias postgres   -e POSTGRES_USER=lab -e POSTGRES_PASSWORD=lab -e POSTGRES_DB=repairs postgres:17-alpine)
attempts=0
until docker exec "$db" pg_isready -h 127.0.0.1 -U lab -d repairs >/dev/null 2>&1; do
  attempts=$((attempts + 1))
  test "$attempts" -lt 40
  sleep 1
done
database=postgresql://lab:lab@postgres:5432/repairs
actors=$(node --input-type=module -e 'import { actors } from "./test/actors.js"; console.log(JSON.stringify(Object.values(actors)))')
# First run on an empty database proves the startup migration precedes actor lookup.
if docker run --rm --network "$network" -e DATABASE_URL="$database" -e ACTOR_TOKENS="$actors" "$image"; then
  echo 'Expected startup to refuse an unprovisioned actor' >&2
  exit 1
fi
docker exec "$db" psql -v ON_ERROR_STOP=1 -U lab -d repairs -c \
  "SELECT name FROM schema_migrations; INSERT INTO users (id, role) VALUES
  ('resident-1', 'resident'), ('resident-2', 'resident'),
  ('tech-1', 'technician'), ('tech-2', 'technician');"
app=$(docker run -d --network "$network" -p 127.0.0.1::3000 \
  -e DATABASE_URL="$database" -e ACTOR_TOKENS="$actors" "$image")
address=$(docker port "$app" 3000/tcp)
base="http://$address"
attempts=0
until curl -fsS --max-time 3 "$base/ready" > /dev/null 2>&1; do
  attempts=$((attempts + 1))
  if [ "$attempts" -ge 30 ]; then docker logs "$app"; exit 1; fi
  sleep 1
done
printf 'GET /ready '
curl -fsS "$base/ready"
printf '\nGET /version '
version=$(curl -fsS "$base/version")
printf '%s\n' "$version"
test "$version" = "{\"sha\":\"$sha\"}"
node --input-type=module - "$base" <<'JS'
import { client, repairJourney } from './test/api-scenario.js';
await repairJourney(client(process.argv[2]), 'container-smoke');
console.log('Container HTTP repair journey passed');
JS
docker stop "$db" >/dev/null
code=$(curl -sS --max-time 9 -o /dev/null -w '%{http_code}' "$base/ready")
printf 'GET /ready with PostgreSQL stopped: %s\n' "$code"
test "$code" = 503
code=$(curl -sS --max-time 9 -o /dev/null -w '%{http_code}' "$base/health")
printf 'GET /health with PostgreSQL stopped: %s\n' "$code"
test "$code" = 200
