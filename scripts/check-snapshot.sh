#!/bin/sh
set -eu

snapshot=$1
if [ ! -f "$snapshot/package.json" ]; then
  exit 0
fi

if [ -d node_modules ] && cmp -s package-lock.json "$snapshot/package-lock.json"; then
  ln -s "$PWD/node_modules" "$snapshot/node_modules"
else
  (cd "$snapshot" && npm ci --no-audit --no-fund)
fi
(cd "$snapshot" && npm run check)
