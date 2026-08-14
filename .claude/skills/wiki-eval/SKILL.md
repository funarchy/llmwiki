---
name: wiki-eval
description: Use when a wiki-answerable question needs to become a durable regression test, when checking whether the bundle still answers its known questions correctly, or immediately after answering a repository question from general knowledge instead of a wiki page (the proactive add trigger). Also use to list or triage recorded eval cases.
---

# wiki-eval

Usability tests for the bundle: does navigating from the root index actually
land on a correct answer. Four modes, all operating on case files under
`<bundle-root>/_meta/eval/`.

## 0. Find the bundle root

Read `bundle.root` from `llmwiki.yaml` at the repository root; it defaults to
`llmwiki` if the key is absent. Case files live at
`<bundle-root>/_meta/eval/<kebab-case-question>.md`.

## Case file shape

Frontmatter fields: `question`, `added` (date), `status` (`to_resolve` or
`satisfied`), and optionally `pages-needed`, `navigation`, and
`answer-must-mention`. The body holds either a `## Correct answer` section
(once resolved) or a `## Current wiki answer` section (while unresolved,
recording what the bundle says today even though it's wrong or incomplete).

A freshly added, unresolved case:

```markdown
---
question: What happens to skill hashes when a bundle-only lock write occurs?
added: 2026-08-14
status: to_resolve
pages-needed: []
---

## Current wiki answer

No page addresses this yet.
```

A resolved case, after human confirmation:

```markdown
---
question: What happens to skill hashes when a bundle-only lock write occurs?
added: 2026-08-14
status: satisfied
navigation: [index.md, commands/install.md, format/lock-file.md]
answer-must-mention: [read-modify-write, Lock.bundles]
---

## Correct answer

The lock write preserves `Lock.bundles` untouched via read-modify-write;
confirmed by jkbo on 2026-08-14.
```

## Mode: `add <question>`

Derive a kebab-case filename from the question, write a new `to_resolve` case
with today's date, and link it from the eval index
(`<bundle-root>/_meta/eval/index.md`).

**Proactive trigger**: run this automatically, without being asked, whenever
a question about the repository just got answered from general knowledge or
a codebase search rather than from a wiki page. That is the gap `wiki-eval`
exists to track.

## Mode: single run

Spawn a fresh navigator agent whose only source of truth is the bundle: give
it the question and nothing else, and instruct it to start at
`<bundle-root>/index.md` and follow only links from there — no grep, no
outside knowledge. The navigator reports:

- the navigation path taken (page by page),
- the answer it arrived at, with quoted supporting text,
- a verdict: `FOUND`, `PARTIAL`, or `NOT_FOUND`.

On `FOUND`, present the navigator's answer to the human for confirmation
before upgrading the case to `satisfied`. Only upgrade after that
confirmation, and record the navigation path, the answer, and who confirmed
it in the case file.

On `PARTIAL` or `NOT_FOUND`, do not upgrade the case. Record what the bundle
currently says (or that nothing addresses it) under `## Current wiki answer`,
and note which pages are needed to close the gap.

## Mode: batch (no arguments)

Run every case in `<bundle-root>/_meta/eval/` sequentially through the same
fresh-navigator protocol. For each `satisfied` case, check the navigator's
navigation path and answer against the case's stored `navigation` and
`answer-must-mention` expectations. Flag any regression prominently — a
previously satisfied case that now comes back `PARTIAL` or `NOT_FOUND`, or
whose navigation path or required phrases no longer match. Finish with a
summary table of case, status, and verdict.

## Mode: `list`

Print every case with its status and stored answer. No agents are spawned for
this mode — it is a read of the case files only.

## Dependency-aware rule

A case that fails because the gap sits in `deps/` territory is an **upstream
gap** — the producing repository's bundle is incomplete or wrong, not this
one's. Report it as belonging to that repository (in Funarchy terms, a
pollution against it) and never patch a vendored page to make the case pass
locally.
