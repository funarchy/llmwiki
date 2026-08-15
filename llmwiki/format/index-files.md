---
$schema: ../_meta/page.schema.json
type: topic
title: Index files
description: Why index.md files carry no frontmatter and what lint enforces about them
tags: [format]
sources:
  - src/lint/checks/index-frontmatter.ts
  - src/lint/checks/dir-index.ts
  - src/lint/checks/orphans.ts
---

`index.md` files are directory routers, not concept pages: per OKF §8 they
carry no frontmatter at all, except that the bundle root's `index.md` may
declare `okf_version`. The body is a heading plus a bullet list, one entry
per child, using inline links (index files are the one place inline links
are allowed — see [the links rule][links]):

```markdown
# Section title

* [Child title](/llmwiki/commands/lint.md) - one-line description
* [Subdirectory](/llmwiki/commands/index.md) - one-line description
```

The separator is ` - ` (space-hyphen-space), not an em dash.

`indexFrontmatter` (`src/lint/checks/index-frontmatter.ts`, check 3) rejects
any `index.md` with a frontmatter block that isn't either absent or, at the
bundle root only, exactly `{okf_version}` — including an *empty* block, which
would otherwise satisfy "only okf_version" vacuously.

`dirIndex` (check 6) requires every directory that contains at least one
loaded page to have its own `index.md` — a page with no router pointing at
it is unreachable by definition.

`orphans` (check 5) enforces reachability directly: starting from the bundle
root's `index.md`, it walks index-to-index and index-to-page links (only
router pages propagate reachability further) and flags every page not
reached. A page can be linked from *another page's* prose and still be an
orphan if no index chain leads to it — the router structure is what has to
connect, not just any link.

[links]: /llmwiki/format/links.md
