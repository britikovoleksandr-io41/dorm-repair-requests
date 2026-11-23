#!/bin/sh
set -eu

if [ -n "${DATABASE_URL:-}" ]; then
  "$@"
  exit $?
fi

container=$(docker run --rm -d -e POSTGRES_USER=lab -e POSTGRES_PASSWORD=lab   -e POSTGRES_DB=repairs -p 127.0.0.1::5432 postgres:17-alpine)
trap 'docker stop "$container" >/dev/null' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
address=$(docker port "$container" 5432/tcp)
export DATABASE_URL="postgresql://lab:lab@$address/repairs"
attempts=0
until docker exec "$container" pg_isready -h 127.0.0.1 -U lab -d repairs >/dev/null 2>&1; do
  attempts=$((attempts + 1))
  if [ "$attempts" -ge 45 ]; then
    docker logs "$container" >&2
    exit 1
  fi
  sleep 1
done
"$@"
