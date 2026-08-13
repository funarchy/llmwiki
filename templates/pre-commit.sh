#!/bin/sh
# Installed by `llmwiki init`. Blocks a commit when the bundle fails lint.
exec npx --no-install llmwiki lint
