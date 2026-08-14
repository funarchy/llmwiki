---
question: What must a producer repository do to its npm package so consumers can install its bundle?
added: 2026-08-15
status: satisfied
navigation: [index.md, format/index.md, format/page-anatomy.md, format/index-files.md, format/links.md, format/meta-pages.md, composition/index.md, composition/deps-and-vendor.md, composition/rewriting.md, composition/conflicts.md, commands/index.md, commands/install.md, commands/add-rm-update.md, commands/init.md, commands/lint.md, skills/index.md, skills/overview.md]
answer-must-mention: ["package.json#files", llmwiki.yaml]
---

## Correct answer

Ship the bundle root and `llmwiki.yaml` in `package.json#files` — what
`llmwiki init` writes into a producer's `package.json` — so the npm
resolver reads the bundle from the installed package; the vendoring
process itself excludes the producer's `_meta/`, `deps/`, `vendor/`
and bundle-root `README.md`; confirmed by jkbo on 2026-08-15.

Navigator: claude-haiku-4-5, fresh session, links-only from the root
index. **Navigability smell:** this case was added expecting
NOT_FOUND, and the navigator answered correctly only by reading all
17 pages of the bundle — the answer exists as fragments of init.md
and deps-and-vendor.md, not as a producer-side page, so the token
cost was the whole bundle, not a few hops. A future
`commands/publishing-a-bundle.md` would make this navigable; the open
gaps-command case tracks the sibling documentation hole found the
same day.
