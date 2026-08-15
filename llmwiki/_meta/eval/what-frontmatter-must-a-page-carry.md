---
question: What frontmatter must a wiki page carry, and which files are exempt?
added: 2026-08-15
status: satisfied
navigation: [index.md, format/index.md, format/page-anatomy.md, format/index-files.md, format/meta-pages.md, format/links.md, commands/index.md, composition/index.md, skills/index.md, commands/lint.md, skills/overview.md, commands/init.md]
answer-must-mention: [type, title, description, sources, index.md, README.md, _meta]
---

## Correct answer

A concept page requires `type`, `title`, `description` (at least 10
characters) and `sources` (a non-empty array), plus the relative
`$schema` reference; `tags` is optional and `generated`, `verified`,
`status`, `stale_after` are permitted. Exempt: `index.md` files (no
frontmatter at all, except `okf_version` at the bundle root), the
bundle-root `README.md` (and a linked dep's nested `README.md` under
`mode: link`), and everything under `_meta/`, which `loadBundle` skips
entirely. `type: meta` pages are not exempt; confirmed by jkbo on
2026-08-15.

Navigator: claude-haiku-4-5, fresh session, links-only from the root
index.
