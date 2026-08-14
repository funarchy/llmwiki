---
$schema: ../_meta/page.schema.json
type: topic
title: llmwiki install
description: What install does, what --frozen changes, and how the lock file is written
tags: [commands, install]
sources:
  - src/commands/install.ts
  - src/lock.ts
  - docs/superpowers/specs/2026-08-13-llmwiki-design.md
---

`llmwiki install [--frozen]` is the one engine (`syncDeps`,
`src/commands/install.ts`) behind `install`, `add`, `rm` and `update`: it
resolves the full dependency graph from `llmwiki.yaml`, vendors each
resolved bundle into `<root>/deps/<name>/` (or symlinks it, under `mode:
link`), regenerates `<root>/deps/index.md` and `<root>/vendor/index.md`, and
writes `llmwiki-lock.json`. It is idempotent: running it again with an
unchanged `llmwiki.yaml` reproduces the same lock and the same vendored
tree.

**`--frozen` verifies instead of writing** — the `npm ci` equivalent. It
still resolves the graph and computes what the lock *would* be, but instead
of writing it, compares the computed lock against the one on disk
(`locksEqual`, `src/lock.ts`) and throws an error naming `llmwiki-lock.json`
as out of date if they differ. This is the check meant for CI and
`postinstall`: a frozen install must never silently relock a tree a human
hasn't reviewed. The vendored `deps/` tree is still cleared and rebuilt from
the resolved graph even under `--frozen` — only the lock *write* is skipped
— so `--frozen` is a check on whether `llmwiki.yaml` and the lock still
agree, not a read-only dry run. Verifying nobody hand-edited the vendored
tree itself is a separate job, done at lint time by `vendored-lock` (lint
check 9), which re-derives the expected content in memory without touching
disk — see [lint][lint].

`syncDeps` reads the previous lock only to preserve `Lock.skills` across the
write (`readLock`/`writeLock` in `src/lock.ts` do a read-modify-write, never
a blind overwrite) — `skills sync` and `install` write to the same lock file
without clobbering each other's half.

A version conflict or dependency cycle in the graph aborts before anything
is written: `resolveGraph` throws `ConflictError` or `CycleError`, and
`install` reports it and exits non-zero rather than writing a broken lock —
see [conflicts][conflicts].

This repository declares no dependencies (`deps: {}` in `llmwiki.yaml`), so
`install` here vendors nothing; `llmwiki-lock.json` carries only the `skills`
half, written by `init`'s call to `skills sync`.

[lint]: /llmwiki/commands/lint.md
[conflicts]: /llmwiki/composition/conflicts.md
