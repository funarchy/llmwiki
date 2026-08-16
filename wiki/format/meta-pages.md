---
$schema: ../_meta/page.schema.json
type: topic
title: Meta pages and _meta/
description: The difference between a type meta concept page and the tooling-only _meta directory
tags: [format]
sources:
  - src/bundle/load.ts
  - schemas/page.schema.json
---

`type: meta` is an ordinary concept page — same required frontmatter, same
lint checks — whose subject happens to be the bundle itself rather than the
repository it documents. It lives wherever the loader walks, typically the
bundle root, and is **not** placed inside `_meta/`.

`_meta/` is a different thing entirely: tooling only, never concept pages.
`EXCLUDED_DIRS` in `src/bundle/load.ts` names it explicitly, and `loadBundle`
skips it while walking the tree — so nothing under `_meta/` is loaded into
the page model at all. Two things live there today:

- `_meta/page.schema.json` — the JSON Schema every concept page's frontmatter
  validates against (see [page anatomy][page-anatomy]).
- `_meta/eval/` — this repository's own `wiki-eval` case files, whose
  frontmatter (`question`, `status`, …) is not concept-page frontmatter at
  all.

The consequence of the exclusion is deliberate, not accidental: a `type:
meta` page mistakenly placed under `_meta/` would not be rejected by any
check — it would simply be invisible to every one of them, orphan check
included. That failure mode is worse than a loud rejection, which is why the
convention is to keep `_meta/` for tooling and put `meta` pages anywhere else
the loader actually walks.

`page.schema.json`'s `type` field accepts exactly two values: `topic` (the
default — answers one question) and `meta`. Nothing in the lint suite treats
`meta` differently from `topic` beyond that enum membership; the distinction
is informational, for a reader deciding whether a page is *about* the
product or *part of* it.

[page-anatomy]: /wiki/format/page-anatomy.md
