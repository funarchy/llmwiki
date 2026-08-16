#!/bin/sh
# Installed by `wiki-sticky init`. Blocks a commit when the bundle fails lint.
# Prefer the installed binary; fall back to a built checkout of wiki-sticky
# itself (the dogfood case — package.json must name wiki-sticky, so a
# consumer's own dist/cli.js is never executed). If neither exists, warn
# and let the commit through — a hook that blocks every commit teaches
# people to delete hooks, not to install linters. The check is purely
# local: no registry resolution, no network, no hang when the registry
# is unreachable.
root="$(git rev-parse --show-toplevel)"
if [ -x "$root/node_modules/.bin/wiki-sticky" ]; then
  exec "$root/node_modules/.bin/wiki-sticky" lint
elif [ -f "$root/dist/cli.js" ] && grep -q '"name": "wiki-sticky"' "$root/package.json" 2>/dev/null; then
  exec node "$root/dist/cli.js" lint
else
  echo "pre-commit: wiki-sticky is not installed in this repository; skipping bundle lint." >&2
  echo "pre-commit: npm install --save-dev wiki-sticky   (to enable the gate)" >&2
  exit 0
fi
