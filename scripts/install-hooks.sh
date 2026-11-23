#!/bin/sh
set -eu

cd "$(git rev-parse --show-toplevel)"
destination=$(git rev-parse --git-path hooks)
mkdir -p "$destination"
for hook in pre-commit pre-push; do
  if [ -e "$destination/$hook" ] && ! cmp -s "hooks/$hook" "$destination/$hook"; then
    echo "Existing hook must be preserved: $destination/$hook" >&2
    exit 1
  fi
done
for hook in pre-commit pre-push; do
  install -m 755 "hooks/$hook" "$destination/$hook"
done
