---
okf_version: '0.2'
---

# llmwiki knowledge base

llmwiki's own bundle, documenting llmwiki itself: an
[OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)-conformant
bundle format plus the dependency layer that lets one repository's bundle
consume another's. This is a dogfood bundle — the real CLI, run on this
repository, holding this documentation to the same lint it holds anyone
else's.

* [Bundle format](/llmwiki/format/index.md) - what a page, an index file and a link look like, and why
* [Commands](/llmwiki/commands/index.md) - init, lint, install, add, rm, update
* [Composition](/llmwiki/composition/index.md) - the deps/vendor trust split, link rewriting, version conflicts
* [Skills](/llmwiki/skills/index.md) - the five agent-facing skills and when each triggers

The full specification lives at
[docs/superpowers/specs/2026-08-13-llmwiki-design.md](/docs/superpowers/specs/2026-08-13-llmwiki-design.md);
this bundle documents the same product from inside its own format, and where
the two disagree, the code — and this bundle, which cites it — wins.
