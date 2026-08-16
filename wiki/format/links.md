---
$schema: ../_meta/page.schema.json
type: topic
title: Links
description: Why body links must be reference-style and repo-root-absolute, never inline or relative
tags: [format]
sources:
  - src/md/links.ts
  - src/lint/checks/link-absolute.ts
  - src/lint/checks/link-reference-style.ts
---

Every link in a page body must be reference-style, with a repo-root-absolute
path — `[text][ref]` in the prose, `[ref]: /wiki/path/page.md` in a footer
definition at the end of the page. No inline `[text](url)` in bodies, no
relative paths, no `[[wikilinks]]`. Index files are the one exception to the
reference-style half: OKF §8 has them use inline links (see [the index-files
page][index-files]), and they are absolute too.

Four independent reasons back the absolute half (design spec §3.3):

1. **One rule an agent cannot get wrong.** A conditional convention — relative
   inside a bundle, absolute across bundles — is a rule that gets violated in
   practice even when it optimizes better on paper.
2. **Half the move-breakage.** A relative link breaks when *either* end moves;
   an absolute link breaks only when the target moves.
3. **It removes the arithmetic from vendoring.** An absolute rewrite is a
   prefix substitution, identical for every page at any depth — see [how
   rewriting works][rewriting]. A relative rewrite would need a different
   answer per page.
4. **It reads.** `/wiki/deps/@scope/pkg/traits.md` states what it points
   at without requiring you to know where you're standing.

The cost, paid knowingly: GitHub's web view resolves a leading slash against
`github.com`, so page content renders but click-through 404s.

Two lint checks enforce this, independently: `linkReferenceStyle` (check 7,
`src/lint/checks/link-reference-style.ts`) flags any inline link or image in
a concept page's body; `linkAbsolute` (check 8,
`src/lint/checks/link-absolute.ts`) flags any body link that isn't
repo-root-absolute, and separately flags a `/blob/`, `/tree/` or `/raw/`
GitHub URL that names this repository's own remote — a full URL pinning to a
branch when a repo-root-absolute path already names the same file.
`linksResolve` (check 4) then confirms the target actually exists, matching
the real directory entry's case exactly rather than trusting a
case-insensitive filesystem.

Reference-style matters beyond style: because every link lives in a footer
definition line, the vendoring rewrite (link below) can confine its prefix
substitution to those lines, leaving prose and fenced code untouched.

[index-files]: /wiki/format/index-files.md
[rewriting]: /wiki/composition/rewriting.md
