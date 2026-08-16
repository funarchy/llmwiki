# AGENTS.md

Instructions for agents working in this repository. Knowledge does not
live here — see the last section.

## Build, test, lint

- `npm run build` — compile TypeScript to `dist/`
- `npm run typecheck` — typecheck sources and tests together
- `npx vitest run` — the full test suite; must be green before a commit
- `node dist/cli.js lint` — lint this repository's own bundle (dogfood)
- `node dist/cli.js install --frozen` — verify the lock matches (CI)

Run the build before the CLI commands — `dist/` is what executes. CI
(`.github/workflows/ci.yml`) runs exactly this sequence; the pre-commit
hook runs lint locally.

## Conventions

- The five agent skills under `skills/wiki-*/SKILL.md` are the
  canonical copies; `.claude/skills/` and `.agents/skills/` are
  installed copies, synced by `wiki-sticky skills sync` and hash-locked in
  `wiki-sticky-lock.json`. Edit the canonical copy, then sync.

## Knowledge

This repository's knowledge lives in its wiki-sticky bundle at
[/wiki/](wiki/index.md), not in this file. Start at
`wiki/index.md` and navigate by links — the wiki-search skill is the
read path. Do not copy knowledge into this file; add or update a bundle
page instead (wiki-ingest is the write path).
