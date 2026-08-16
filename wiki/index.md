---
okf_version: '0.2'
---

# wiki-sticky knowledge base

wiki-sticky's own bundle, documenting wiki-sticky itself: an
[OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)-conformant
bundle format plus the dependency layer that lets one repository's bundle
consume another's. This is a dogfood bundle — the real CLI, run on this
repository, holding this documentation to the same lint it holds anyone
else's.

* [Bundle format](/wiki/format/index.md) - what a page, an index file and a link look like, and why
* [Commands](/wiki/commands/index.md) - init, lint, install, add, rm, update
* [Composition](/wiki/composition/index.md) - the deps/vendor trust split, link rewriting, version conflicts
* [Skills](/wiki/skills/index.md) - the five agent-facing skills and when each triggers

This bundle documents the product from inside its own format; where it
disagrees with anything else, the code — and this bundle, which cites
it — wins.
