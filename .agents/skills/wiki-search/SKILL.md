---
name: wiki-search
description: Use when a question about how this repository or product works could be answered from the llmwiki bundle instead of general knowledge or grepping the codebase — "how does X work", "where is Y decided", "what's the policy on Z". Prefer this over answering from memory or from a plain code search whenever a bundle exists.
---

# wiki-search

The read path. Answer strictly from the bundle's own content — navigation and
citation, not invention.

## 0. Find the bundle root

Read `bundle.root` from `llmwiki.yaml` at the repository root; it defaults to
`llmwiki` if the key is absent. Call this `<bundle-root>` below.

## 1. Navigate, don't grep

Start at `<bundle-root>/index.md` and follow links from there. The index
structure is the router — treat it as the intended path to any answer, not as
one option among several ways to find content. Do not `grep` the tree looking
for a matching string; that finds pages without showing whether they are the
right ones or how they relate to each other, and it skips the gap-detection
that navigation gives for free.

Read every page you land on in full before deciding whether it answers the
question or where to go next.

## 2. Compose the answer

Build the answer from the pages actually read. When more than one page
contributes, compose the answer on the fly rather than picking a single page
and ignoring the rest. Cite every page used, by its repo-root-absolute path,
for example:

> Channel wiring happens in `channel()`; ownership of the resulting state is
> decided per the rules in `/llmwiki/stack/pms/ownership.md`
> (`/llmwiki/stack/pms/runtime.md`).

## 3. Report which subtree each part came from

The bundle has three subtrees with different trust levels: the repository's
own pages, `deps/<pkg>/` (upstream-authored, vendored as-is), and
`vendor/<pkg>/` (this repository's own synthesis of a third party's
documentation). When an answer draws on `deps/` or `vendor/` content, say so
per part of the answer — "synthesized from their docs" (`vendor/`) must never
read as "upstream said so" (`deps/`). Do not blur the two.

## 4. Surface gaps explicitly

After answering, state whether the bundle had a gap, even if the question was
still answerable:

- **Missing page** — no page addressed part of the question. Suggest what
  source (doc, code path, URL) an ingest could draw on to fill it.
- **Stale or incomplete page** — a page exists but is out of date or thin.
  Suggest `wiki-ingest` to update it or `wiki-review` to check it.
- **Nothing** — the bundle answered the question fully; say so plainly.

## Never answer from outside the wiki silently

If the bundle cannot answer the question and you fall back to general
knowledge or a codebase search to produce an answer anyway, say so explicitly
— going beyond the wiki is itself a gap, and it must be reported the same way
a missing page is, not folded silently into the answer.
