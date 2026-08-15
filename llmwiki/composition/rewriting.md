---
$schema: ../_meta/page.schema.json
type: topic
title: Vendoring's link rewrite
description: Why every vendored link is a prefix substitution and how the rewrite maps each case
tags: [composition]
sources:
  - src/vendor/rewrite.ts
  - src/lint/checks/vendored-lock.ts
---

Vendoring relocates a bundle, so every absolute link inside a vendored page
has to be retargeted. Because [links are repo-root-absolute][links], this is
a prefix substitution — identical for every page at any depth in the
bundle, never per-page arithmetic. `rewritePage`
(`src/vendor/rewrite.ts`) is the one function that does it: given a page's
content plus the producer's root name, the consumer's root name and the
bundle's name in `deps/`, it matches each footer reference definition and
each index file's inline link on its leading path and rewrites only that
prefix, leaving prose and fenced code untouched (matching happens against a
`stripCode`-blanked copy so link-shaped text inside code is never edited).

Four cases, by what the matched href starts with (producer root `wiki`,
consumer root `llmwiki`, bundle `@scope/pkg`):

| Producer's link | Becomes |
| --- | --- |
| `/wiki/pms/traits.md` (producer's own page) | `/llmwiki/deps/@scope/pkg/pms/traits.md` |
| `/wiki/deps/@scope/other/x.md` (already-hoisted transitive) | `/llmwiki/deps/@scope/other/x.md` — flat, not nested |
| `/wiki/vendor/react-native/hooks.md` | rejected; warned as dangling — a producer's own synthesis is never vendored through |
| `/src/pms/runtime.ts` (outside the producer's root) | left unchanged, warned — should have been a `sources:` entry |

When producer and consumer roots match — the default, since both
conventionally use `llmwiki/` — the first case is a no-op and only the
producer's-own-page case does any rewriting at all.

The rewrite is deterministic by contract: lint check 9 (`vendoredLock`,
`src/lint/checks/vendored-lock.ts`) doesn't compare vendored bytes against a
stored hash of the *result* — it re-derives the whole rewrite from the
resolved producer in memory and compares byte-for-byte with what's on disk,
so `upstreamHash` in the lock only ever needs to cover the producer's
content *before* rewriting.

[links]: /llmwiki/format/links.md
