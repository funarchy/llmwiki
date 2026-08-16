---
name: wiki-ingest
description: Use when knowledge should be recorded in the repository's wiki-sticky bundle — a fact the user just explained, a doc being migrated into the wiki, a config or loader file whose meaning should be extracted, or something learned from code or a URL that took real effort to derive. Covers ambient capture from the current conversation as well as explicit migration requests.
---

# wiki-ingest

The write path. This is the discipline the rest of the wiki rests on: nothing
lands in the bundle without going through classification, an approved
structure, and a lint-clean, single commit.

## 0. Find the bundle root

Read `bundle.root` from `wiki-sticky.yaml` at the repository root; it defaults to
`wiki` if the key is absent. Call this `<bundle-root>` for the rest of this
procedure — never hardcode `wiki/` in a path.

## 1. Classify the source

- **No argument (ambient capture)** — knowledge surfaced in the current
  conversation with no source document behind it. Restate the claim back to
  the user and get confirmation before writing anything.
- **A first-party doc is being migrated** — synthesize its knowledge into wiki
  pages; the original file stays in place (this is migration, not deletion).
- **A config or loader file** — extract the knowledge it encodes into pages,
  then offer to slim the original to a pointer comment only with explicit
  confirmation; never remove or gut it unasked.
- **A URL or a code path** — synthesize the knowledge and cite the URL or
  repo-relative path in the new page's `sources:`.

## 2. Split aggressively

Each page answers exactly one question, roughly 30–80 lines. Keep an
indivisible entity together on one page (a table with the column reference
that explains it, for example) rather than splitting it across pages purely to
hit the line target. If the source material is over ~100 lines, propose a
directory of pages instead of one long page.

## 3. Propose the structure and wait for approval

Before writing a single file, show an ASCII tree of the proposed pages with a
one-line purpose for each, and note the alternative of distributing the
material into the existing structure instead of creating new pages. Wait for
explicit approval. Do not write anything until it is given.

```
stack/pms/
  runtime.md      - how channel(), system() and presentation() wire together
  ownership.md    - which subsystem owns which state at runtime
```

## 4. Write the pages

Required frontmatter: `type`, `title`, `description` (at least 10 characters),
`sources`. `tags` is optional. `sources:` is ground truth for re-verifying a
claim — a repo-relative code path, a database URI, or a genuinely external
URL. Never another wiki page (link that in the body instead), and never a
GitHub URL for code that lives in this repository — use the repo-relative
path.

```markdown
---
$schema: ../_meta/page.schema.json
type: topic
title: PMS runtime
description: How channel(), system() and presentation() wire together at runtime
tags: [pms, runtime]
sources:
  - src/pms/runtime.ts
---

One-paragraph answer to "what do I do", up top. Then detail. Link neighbours
in prose: see [the ownership rules][ownership].

[ownership]: /wiki/stack/pms/ownership.md
```

`$schema` is the one path that stays relative (an editor JSON Schema
reference, not a wiki link) — adjust the `../` depth to reach
`<bundle-root>/_meta/page.schema.json` from the new page's location. Every
other link is reference-style and repo-root-absolute: `[text][ref]` in the
body, `[ref]: /path/to/page.md` in a footer at the end of the page. No inline
`[text](url)` links, no relative paths, no wikilinks.

## 5. Data-loss guard

When migrating from a source document, list every material claim it makes —
facts, constraints, field names, table rows, caveats — and classify each as
Present in a page, Missing, or Intentionally dropped with a stated reason.
Nothing should silently disappear. When the source is a migrated doc, invoke
`wiki-review` against the source and the new pages to get an independent
check before wiring up and committing.

## 6. Wire up

Every new page must be reachable from an `index.md` — add it to the nearest
directory index, one line per page, ` - ` (space-hyphen-space) as the
separator. Cross-link bidirectionally with existing pages at the first
natural mention of a shared concept — one link per target per page, no more.
Refresh entry-point files that should mention the new material: the bundle
root index, a bundle README if one exists, and a `CLAUDE.md` pointer if the
repository has one.

## 7. Lint and commit

Run `wiki-sticky lint` and fix every finding. Make one squashed commit for the
whole ingest:

```
[wiki] ingest: <subject> → <page(s)> (+links)
```

## Dependency-aware rules

- **Refuses to write into `deps/**`.** That tree is upstream-authored and
  read-only. If the knowledge belongs to a dependency, say so explicitly and
  point at the producing repository instead of writing a page here.
- **Owns extraction judgment.** When a page's subject actually belongs
  upstream, propose moving it there by hand (automated extraction is not
  implemented yet). The moved page must not link back into this bundle —
  that would create a cycle across the trust boundary.
- **May write into `vendor/**` only via the `wiki-vendor` procedure** — never
  as a side effect of an ordinary ingest.
