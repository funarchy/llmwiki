---
question: What is the difference between the deps/ and vendor/ directories, and who writes into each?
added: 2026-08-15
status: satisfied
navigation: [index.md, composition/index.md, composition/deps-and-vendor.md]
answer-must-mention: [install, wiki-vendor, "generated: true", read-only]
---

## Correct answer

The path encodes trust. `deps/` means "upstream said this": written
only by `llmwiki install` (via add/rm/update), read-only by convention
— to change a page there, change the producing repository and re-sync.
`vendor/` means "we inferred this from upstream's documentation":
never written by install, authored by the `wiki-vendor` skill when a
dependency ships no bundle, every page carrying `generated: true`,
provenance declared in `llmwiki.yaml`'s `vendor:` block; confirmed by
jkbo on 2026-08-15.

Navigator: claude-haiku-4-5, fresh session, links-only from the root
index. Three link hops.
