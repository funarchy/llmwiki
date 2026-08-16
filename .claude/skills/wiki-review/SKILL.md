---
name: wiki-review
description: Use for an adversarial second look at wiki pages — after a migration ingest, to check a new or edited page against pages it might conflict with, or to judge whether existing pages still meet the bundle's writing conventions. Never for mechanical link or format problems (that's `wiki-sticky lint`), and never to edit pages directly — this produces a report only.
---

# wiki-review

Advisory only. This skill emits a report; it never edits a page itself. Every
finding quotes the specific lines it concerns, carries a confidence, and the
whole exercise defaults to "no issue" — surface only the findings you cannot
talk yourself out of. A review that manufactures findings to look thorough is
worse than a short one.

## 0. Find the bundle root

Read `bundle.root` from `wiki-sticky.yaml` at the repository root; it defaults to
`wiki` if the key is absent. Call this `<bundle-root>` below.

## Scope

Review the diff against the default branch, or explicit page targets if the
caller names them. Don't review the whole bundle by default — that dilutes a
report into noise.

## The three checks

### 1. Data loss (migration-time only)

Only applies when reviewing a migration from a source document into pages.
List every material claim the source makes — facts, constraints, field
names, table rows, caveats — and classify each one:

- **Present** — represented in a page; name which one.
- **Missing** — not represented anywhere, and not flagged as dropped.
- **Intentionally dropped** — not represented, but the ingest said so and
  gave a reason.

Only "Missing" is a finding; the other two are bookkeeping that shows the
check was actually done.

### 2. Conflicts

Look for two pages that assert things a reader would *act on differently*.
Quote both sides. Different levels of detail between two pages covering the
same topic is not a conflict — only contradiction is.

### 3. Convention judgment

Judge each page against the bundle's writing conventions:

- Does the opening paragraph actually answer the question the page exists
  for, rather than warming up to it?
- Does every sentence earn its place — no throat-clearing, no vibes
  adjectives ("robust", "powerful", "seamless") standing in for a concrete
  claim?
- Is the page single-purpose, or does it answer more than one question?
- Is `sources:` doing its job as ground truth — code paths, DB URIs,
  external URLs — rather than being used as prose or padding?
- Is a wiki-worthy concept mentioned in the page's body without a link to
  the page that covers it?

## Dependency-aware rule

**Never reviews `deps/**`** — that content isn't this repository's to judge;
route any concern about it to the producing repository instead. **Does
review `vendor/**`** — that's this repository's own synthesis, and it is
exactly the kind of content this skill exists to check.

## What this skill does not do

Mechanical checks — broken links, non-reference-style links, relative or
GitHub-URL links, missing required frontmatter, filenames not in
`kebab-case.md`, orphan pages, missing `index.md` — belong to `wiki-sticky lint`,
not to this skill. Don't reproduce lint's job in a review report; if a
mechanical problem is spotted in passing, just say "also run `wiki-sticky lint`"
rather than listing it as a review finding.
