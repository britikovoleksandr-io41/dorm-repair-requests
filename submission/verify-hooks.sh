#!/bin/sh
set -eu

root=$(git rev-parse --show-toplevel)
mkdir -p "$root/.lab-local"
fixture=$(mktemp -d "$root/.lab-local/lab01-hooks.XXXXXX")
trap 'rm -rf "$fixture"' EXIT
git -C "$root" archive --output="$fixture/tree.tar" 52ff4b8
mkdir "$fixture/tree"
tar -xf "$fixture/tree.tar" -C "$fixture/tree"
cd "$fixture/tree"
git -c init.templateDir= init -q -b fixture
git config core.hooksPath .git/hooks
git config user.name 'Local Hook Fixture'
git config user.email 'fixture@example.invalid'
git config commit.gpgsign false

test ! -e .git/hooks/pre-commit
test ! -e .git/hooks/pre-push
echo 'Fresh fixture checkout has no active project hooks'
git add .
git commit -qm 'test: import lab foundation into isolated fixture'
clean=$(git rev-parse HEAD)
printf '%s\n' '// Intentional negative hook test.' 'export const negative={lab:1}' > src/negative.js
git add src/negative.js
git commit -qm 'test: create intentional negative hook fixture'
dirty=$(git rev-parse HEAD)
git checkout -q "$clean"

npm ci --prefer-offline --no-audit --no-fund
npm run hooks:install
test -x .git/hooks/pre-commit
test -x .git/hooks/pre-push
echo 'Both project hooks installed'

run_pre_push() {
  printf 'refs/heads/fixture %s refs/heads/fixture %040d\n' "$1" 0 | .git/hooks/pre-push
}
run_pre_push "$clean"
echo 'Clean pre-push exit=0'
if run_pre_push "$dirty" > "$fixture/negative.txt" 2>&1; then
  echo 'Negative pre-push unexpectedly passed' >&2
  exit 1
else
  status=$?
  cat "$fixture/negative.txt"
  grep -Fq "[warn] src/negative.js" "$fixture/negative.txt"
  printf 'Intentional negative pre-push exit=%s\n' "$status"
  test "$status" -eq 1
fi
test ! -f src/negative.js
test "$(git rev-parse HEAD)" = "$clean"
echo 'Hook checked the supplied SHA while the fixture working tree stayed clean'
