#!/bin/sh
# Installed by `llmwiki init`. Blocks a commit when the bundle fails lint.
# If llmwiki is not installed in this repository, warn and let the commit
# through — a hook that blocks every commit teaches people to delete hooks,
# not to install linters. The check is purely local: no registry resolution,
# no network, no hang when the registry is unreachable.
if [ ! -x "$(git rev-parse --show-toplevel)/node_modules/.bin/llmwiki" ]; then
  echo "pre-commit: llmwiki is not installed in this repository; skipping bundle lint." >&2
  echo "pre-commit: npm install --save-dev llmwiki   (to enable the gate)" >&2
  exit 0
fi
exec "$(git rev-parse --show-toplevel)/node_modules/.bin/llmwiki" lint
