---
$schema: ../_meta/page.schema.json
type: topic
title: wiki-sticky lint
description: The 12 mechanical checks lint runs, in order, and which ones only warn
tags: [commands, lint]
sources:
  - src/lint/checks/index.ts
  - src/lint/run.ts
---

`wiki-sticky lint` runs 12 checks over the bundle model, in the fixed order they
are registered in `src/lint/checks/index.ts`, and prints one line per
finding plus an error/warning count. Exit code is 1 if any finding is
`error` severity, 0 otherwise (`exitCodeFor`, `src/lint/run.ts`) — a run with
only warnings still exits clean.

| # | id | Checks | Severity |
| --- | --- | --- | --- |
| 1 | `kebab-case` | filenames are `kebab-case.md` | error |
| 2 | `frontmatter` | required frontmatter present, `type` valid, `sources` non-empty | error |
| 3 | `index-frontmatter` | `index.md` has no frontmatter except `okf_version` at the bundle root | error |
| 4 | `links-resolve` | every repo-absolute link resolves, case-exactly | error |
| 5 | `orphans` | every page reachable from the bundle root's `index.md` | error |
| 6 | `dir-index` | every directory with pages has an `index.md` | error |
| 7 | `link-reference-style` | body links are reference-style, no inline `[text](url)` | error |
| 8 | `link-absolute` | body link paths are repo-root-absolute; no same-repo GitHub blob/tree/raw URLs | error |
| 9 | `vendored-lock` | vendored `deps/` matches the lock and re-derives from the producer | error (warning if the producer isn't resolvable) |
| 10 | `generated-indexes` | `deps/index.md` and `vendor/index.md` are current | error |
| 11 | `root-links-deps` | root index links `deps/`/`vendor/` when they exist | error |
| 12 | `skills-current` | the lock's recorded skill hashes match the shipped skills — installed copies are never read, so user edits under `vendored` mode are not compared | **warning, always** |

Check 12 (`skills-current`, `src/lint/checks/skills-current.ts`) is the one
check that is never an error, by design — a stale skill must never fail CI,
only nudge `wiki-sticky skills sync`. It is silent entirely when `config.skills`
is `off`. Check 9 (`vendored-lock`) is the only other check with a
warning branch: it degrades to a warning, rather than an error, specifically
when a vendored bundle's producer cannot be resolved (a fresh clone before
`npm install` has run) — everything about a vendored bundle that is
verifiable without the producer present still errors.

This repository has no `deps/` or `vendor/` trees, so checks 9–11 have
nothing to check and stay silent on this bundle; they exercise their full
logic only once a dependency is added.

The design spec describes a future `lint --fix` that regenerates only the
generated `deps/`/`vendor/` index files. The current `lint` command
(`src/commands/lint.ts`, registered with no options in `src/cli.ts`) takes no
flags at all — regenerating those indexes today means running `wiki-sticky
install`, which writes them as a side effect of syncing dependencies. See
[install][install].

[install]: /wiki/commands/install.md
