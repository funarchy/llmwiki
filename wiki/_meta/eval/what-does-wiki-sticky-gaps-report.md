---
question: What does wiki-sticky gaps report, and where do its inputs live?
added: 2026-08-15
status: to_resolve
pages-needed:
  - wiki/commands/gaps.md
---

## Current wiki answer

No page addresses this. `commands/index.md` routes to init, lint,
install and add/rm/update only — the `gaps` command (unresolved eval
cases from `_meta/eval/` frontmatter `status: to_resolve`, plus pages
whose body carries the `**Stub.**` marker; `src/commands/gaps.ts`) is
undocumented in the bundle. Found on 2026-08-15 while seeding this
eval suite: every navigator that walked `commands/` confirmed no
mention of `gaps`.
