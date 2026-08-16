---
$schema: ../_meta/page.schema.json
type: topic
title: wiki-sticky init
description: What init scaffolds, what it prompts for, and how it handles an existing docs directory
tags: [commands, init]
sources:
  - src/commands/init.ts
  - templates/root-index.md
  - templates/pre-commit.sh
---

`wiki-sticky init [--yes]` scaffolds a bundle in the current repository:
`<root>/index.md` (from `templates/root-index.md`, or adopted as-is if a
plausible bundle already exists), `<root>/_meta/page.schema.json`,
`<root>/_meta/eval/index.md`, and `wiki-sticky.yaml`. If `package.json` exists,
it also adds the bundle root and `wiki-sticky.yaml` to `package.json#files` and
an `wiki-sticky:lint` script. Then it calls `syncSkills` against the
just-written config (`skills: managed` by default), installing the five
shipped skills into `.claude/skills/` and `.agents/skills/` — see [skills
overview][skills-overview].

**Adoption**: `findAdoptableRoot` checks, in order, `wiki/`, `wiki/` and
`docs/wiki/` for an existing `index.md`, and offers that directory as the
suggested bundle root instead of creating a second one. `--yes` accepts the
suggestion (or the `wiki-sticky` default) without prompting; interactively,
`init` asks for the bundle root and whether to install a pre-commit hook.

**The pre-commit hook** (`templates/pre-commit.sh`) is a real git hook,
installed at `.git/hooks/pre-commit` unless one is already present (in which
case it's left untouched and `init` says so). It is deliberately
non-blocking when wiki-sticky isn't actually usable: it runs
`node_modules/.bin/wiki-sticky lint` when that binary exists, falls back to
`node dist/cli.js lint` when the repository is a built checkout of
wiki-sticky itself (guarded by the package name, so a consumer's own
`dist/cli.js` is never executed), and otherwise prints a skip message
and exits 0 rather than failing every commit in a repository where
wiki-sticky isn't installed.

**Finding a `docs/` directory**: `init` reports it
(`Found a docs/ directory. Migrating it is the wiki-ingest skill's job —
nothing was touched.`) but does not stop or refuse to scaffold — it leaves
`docs/` alone and proceeds. (The design spec describes `init` refusing
outright when a `docs/` directory is present; the shipped behavior is a
report plus a pointer to `wiki-ingest`, not a refusal — this page follows
the code.)

`init` fails outright, before writing anything, if `wiki-sticky.yaml` already
exists in the target directory.

[skills-overview]: /wiki/skills/overview.md
