---
$schema: ../_meta/page.schema.json
type: topic
title: deps/ versus vendor/
description: The trust split encoded in the two subtrees and what each command writes into them
tags: [composition]
sources:
  - src/vendor/copy.ts
  - src/vendor/files.ts
  - src/vendor/link.ts
---

A bundle has two subtrees for content that didn't originate in this
repository, and the path a page lives under encodes how much to trust it —
readable from the location alone, with no metadata lookup needed.

**`<root>/deps/<name>/` means "upstream said this."** It is written only by
`llmwiki install` (via `add`, `rm`, `update`) and is read-only by
convention: to change a page there, change it in the producing repository
and re-sync. `vendorBundle` (`src/vendor/copy.ts`) copies every
`vendorableFiles()`-listed file from the producer's bundle root, rewriting
each `.md` file's links through `rewritePage` (see [rewriting][rewriting])
and copying non-markdown assets byte-for-byte. `vendorableFiles`
(`src/vendor/files.ts`) excludes the
producer's own `_meta/`, `deps/` and `vendor/` — a producer's eval suite
isn't this repository's to act on, and nested vendored trees would duplicate
content arbitrarily deep — plus the producer's bundle-root `README.md`,
which is its front door, not knowledge. Under `mode: link`, `linkBundle`
(`src/vendor/link.ts`) symlinks the producer's root directly instead,
trading link-rewriting and per-file filtering away (the whole tree,
`README.md` included, comes along) for no copy step at all; this repository
uses `mode: copy`, the default.

**`<root>/vendor/<pkg>/` means "we inferred this from upstream's
documentation."** Nothing in `install` writes here — these pages are
authored by the `wiki-vendor` skill (see [skills overview][skills-overview])
when a dependency ships no bundle of its own. Every page in `vendor/`
carries `generated: true`, and provenance is recorded declaratively in
`llmwiki.yaml`'s `vendor:` block (`from:` a URL or path) — `install` never
fetches it automatically.

This repository declares no dependencies and synthesizes nothing, so it has
no `deps/` or `vendor/` directories at all; `llmwiki lint`'s checks 9–11,
which verify those trees, have nothing to check here and stay silent.

[rewriting]: /llmwiki/composition/rewriting.md
[skills-overview]: /llmwiki/skills/overview.md
