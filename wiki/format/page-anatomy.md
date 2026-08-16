---
$schema: ../_meta/page.schema.json
type: topic
title: Page anatomy
description: What frontmatter and body a concept page needs and why each field is required
tags: [format]
sources:
  - schemas/page.schema.json
  - src/bundle/load.ts
---

Every concept page is a `kebab-case.md` file with a YAML frontmatter block and
a markdown body. Frontmatter carries `type`, `title`, `description`
(at least 10 characters) and `sources` (a non-empty array) as required fields;
`tags` is optional, and `generated`, `verified`, `status` and `stale_after`
are permitted but not required — see [the meta-pages
page][meta-pages] for `type: meta`.

```markdown
---
$schema: ../_meta/page.schema.json
type: topic
title: PMS runtime
description: How channel(), system() and presentation() wire together
sources:
  - src/pms/runtime.ts
---

One-paragraph answer up top. Then detail.
```

`$schema` is the one path on a page that stays relative — it is a JSON Schema
reference an editor resolves, not a wiki link, and a leading slash there is
not reliably resolved by that tooling. Every other path in the page follows
[the links rule][links]: reference-style and repo-root-absolute.

`sources:` is ground truth for re-verifying a claim: a repo-relative code
path, a database URI, or a genuinely external URL — never another page in the
bundle (link that in the body) and never a GitHub URL for code that already
lives in this repository. `frontmatterCheck`
(`src/lint/checks/frontmatter.ts`) validates the block against
`schemas/page.schema.json` and reports missing frontmatter, unparseable YAML,
and any field that fails the schema — including a `description` shorter than
10 characters or an empty `sources` array.

There is no `updated:` field. When a page last changed comes from `git log`,
which cannot drift the way a hand-set date can.

`isConceptPage()` in `src/bundle/load.ts` is what decides a file is held to
this schema at all: every `.md` file under the bundle root except `index.md`
files and the bundle-root `README.md` (and, for a `mode: link` dependency,
its nested `README.md` too, since a symlinked tree cannot be filtered file by
file the way copy-vendoring is).

[meta-pages]: /wiki/format/meta-pages.md
[links]: /wiki/format/links.md
