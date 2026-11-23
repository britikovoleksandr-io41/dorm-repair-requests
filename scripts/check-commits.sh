#!/bin/sh
set -eu

base=${1:?base revision required}
head=${2:-HEAD}
if [ "$base" = 0000000000000000000000000000000000000000 ]; then
  # A first push has no previous commit; check the complete reachable history.
  range=$head
else
  git rev-parse --verify "$base^{commit}" >/dev/null
  range="$base..$head"
fi

subjects=$(git log --format='%h %s' "$range")
invalid=$(printf '%s\n' "$subjects" | awk '
  NF && $0 !~ /^[0-9a-f]+ (build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([[:alnum:]_.\/-]+\))?!?: [^[:space:]]/ {
    print
  }
')
if [ -n "$invalid" ]; then
  printf 'Invalid Conventional Commit subjects:\n%s\n' "$invalid" >&2
  exit 1
fi
printf 'Conventional Commit subjects passed for %s\n' "$range"
