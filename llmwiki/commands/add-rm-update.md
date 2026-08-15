---
$schema: ../_meta/page.schema.json
type: topic
title: add, rm and update
description: How the three dependency-editing commands change llmwiki.yaml and re-sync
tags: [commands]
sources:
  - src/commands/add.ts
  - src/commands/rm.ts
  - src/commands/update.ts
---

`add`, `rm` and `update` all edit `llmwiki.yaml` (or nothing, for `update`)
and then call the same `syncDeps` engine [install][install] describes, so
every one of them ends by vendoring the whole resolved graph and rewriting
the lock — never a partial sync, because flat-hoist invariants depend on the
whole tree being resolved together.

**`add <pkg> [--path <dir>]`** validates resolvability *before* touching
`llmwiki.yaml` — it probes `resolveGraph` against a config copy that already
includes the candidate dependency, so a failed add leaves no trace. Only
after that probe succeeds does it write `deps.<pkg>: npm` (or `{source:
path, path: <dir>}` for `--path`) into the YAML document (via `yaml`'s
`parseDocument`, which preserves formatting) and run `syncDeps`. Fails
outright if `pkg` is already declared.

**`rm <pkg>`** deletes the `deps.<pkg>` entry and re-syncs. Because sync
recomputes the whole `deps/` tree from the resulting config, a bundle still
required *transitively* by another remaining dependency stays vendored —
only bundles nothing depends on anymore actually disappear from disk. Fails
if `pkg` isn't currently declared.

**`update [pkg]`** re-resolves without editing `llmwiki.yaml` at all, then
reports a knowledge diff between the previous lock and the new one:
`diffLocks` (`src/commands/update.ts`) prints `+ name vX` for an added
bundle, `- name vX` for a removed one, `~ name vA → vB` for a version bump,
and `~ name vB (content changed, same version)` when only the upstream hash
moved. The optional `pkg` argument only narrows which diff lines print — it
does not narrow what gets re-synced, and errors if `pkg` isn't a declared
dependency. With nothing to report, it prints `Already up to date.`

All three print `rootIndexHints` at the end: a reminder to link
`/llmwiki/deps/index.md` or `/llmwiki/vendor/index.md` from the root index
when a generated tree exists and the root index doesn't yet mention it —
`install` never edits a user-authored file, so this is a nudge, not an
automatic fix. Lint check 11 (`root-links-deps`) is what actually enforces
it.

[install]: /llmwiki/commands/install.md
