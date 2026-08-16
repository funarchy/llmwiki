---
question: How does lint make sure vendored knowledge hasn't been tampered with, and which lint checks only warn?
added: 2026-08-15
status: satisfied
navigation: [index.md, commands/index.md, commands/lint.md, composition/index.md, composition/deps-and-vendor.md, composition/rewriting.md, composition/conflicts.md, skills/index.md, skills/overview.md]
answer-must-mention: [vendored-lock, re-derives, byte-for-byte, skills-current, warning]
---

## Correct answer

Lint check 9 (`vendored-lock`) re-derives the entire vendoring from the
resolved producer in memory — resolve, hash, `vendorableFiles` plus
`rewritePage` — and compares byte-for-byte with the tree on disk, so a
hand-edited vendored page cannot survive; the lock's `upstreamHash` only
covers the producer's pre-rewrite content. Check 12 (`skills-current`)
is the only always-warning check — a stale skill must never fail CI.
Check 9 itself degrades to a warning only when the producer cannot be
resolved (fresh clone before `npm install`); confirmed by jkbo on
2026-08-15.

Navigator: claude-haiku-4-5, fresh session, links-only from the root
index.
