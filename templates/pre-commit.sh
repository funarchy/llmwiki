#!/bin/sh
# Installed by `llmwiki init`. Blocks a commit when the bundle fails lint.
# If llmwiki is not installed in this repository, warn and let the commit
# through — a hook that blocks every commit with an npm 404 teaches people
# to delete hooks, not to install linters.
if ! npx --no-install llmwiki --help >/dev/null 2>&1; then
  echo "pre-commit: llmwiki is not installed in this repository; skipping bundle lint." >&2
  echo "pre-commit: npm install --save-dev llmwiki   (to enable the gate)" >&2
  exit 0
fi
exec npx --no-install llmwiki lint
