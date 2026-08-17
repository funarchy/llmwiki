---
$schema: ../_meta/page.schema.json
type: topic
title: wiki-sticky init
description: What init scaffolds, what it prompts for, and how it handles an existing docs directory
tags: [commands, init]
sources:
  - src/commands/init.ts
  - src/commands/self-pin.ts
  - templates/root-index.md
  - templates/pre-commit.sh
---

`wiki-sticky init [--yes] [--no-install]` scaffolds a bundle in the
current repository: `<root>/index.md` (from `templates/root-index.md`,
or adopted as-is if a plausible bundle already exists),
`<root>/_meta/page.schema.json`, `<root>/_meta/eval/index.md`, and
`wiki-sticky.yaml`. If `package.json` exists, it also adds the bundle
root and `wiki-sticky.yaml` to `package.json#files` and a
`wiki-sticky:lint` script. Then it calls `syncSkills` against the
just-written config (`skills: managed` by default), installing the five
shipped skills into `.claude/skills/` and `.agents/skills/` — see
[skills overview][skills-overview].

**Self-pin** (`selfPin`, `src/commands/self-pin.ts`): because the
script and hook init writes need `node_modules/.bin/wiki-sticky` to
exist, init also adds wiki-sticky itself as a dev dependency, pinned to
the running CLI's own version (`wiki-sticky@^<version>`). The package
manager is detected by lockfile — `bun.lock`/`bun.lockb`,
`pnpm-lock.yaml`, `yarn.lock`, npm as the no-lockfile default. It skips
silently when wiki-sticky is already a dependency or the repository is
wiki-sticky itself, skips loudly (the report says the script and hook
are NOT wired) when there is no `package.json`, reports a failed
package-manager run without aborting init, and `--no-install` opts out
explicitly.

**Adoption**: `findAdoptableRoot` checks, in order, `wiki/` and
`docs/wiki/` for an existing `index.md`, and offers that directory as
the suggested bundle root instead of creating a second one. `--yes`
accepts the suggestion (or the `wiki` default) without prompting;
interactively, `init` asks for the bundle root and whether to install a
pre-commit hook.

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
