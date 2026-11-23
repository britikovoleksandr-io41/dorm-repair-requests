#!/bin/sh
set -eu

target=src/ci-intentional-format-failure.js
(set -C; printf '%s\n' '// Intentional negative CI test.' 'export const negative={lab:4}' > "$target")
trap 'rm -f "$target"' EXIT
npm run check
