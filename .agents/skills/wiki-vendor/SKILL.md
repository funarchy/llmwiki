---
name: wiki-vendor
description: Use when this repository depends on a third-party package that ships no wiki-sticky bundle of its own, and its documentation should be synthesized into the bundle so an agent can find it by navigation instead of an ad hoc web search. Not for first-party knowledge (use `wiki-ingest`) and not for a dependency that already publishes a real bundle (`wiki-sticky add` handles that directly).
---

# wiki-vendor

Synthesizes a bundle for a dependency that doesn't ship one, so the knowledge
becomes navigable alongside everything else. This is inference from upstream
documentation, not upstream's own word — the resulting pages live at
`<bundle-root>/vendor/<pkg>/` specifically so that trust boundary is visible
from the path alone.

## 0. Find the bundle root

Read `bundle.root` from `wiki-sticky.yaml` at the repository root; it defaults to
`wiki` if the key is absent. Write the new bundle to
`<bundle-root>/vendor/<pkg>/`.

## 1. Gather source material, in priority order

1. The upstream package's `llms.txt`, if it publishes one.
2. The package's own `docs/` directory (in its published source or on disk
   under `node_modules/` or equivalent).
3. Its README.
4. Its published documentation site.

Use the first of these that exists and is sufficient; fall back down the list
only where a higher-priority source is silent on something.

## 2. Write the pages

Structure and linking follow the same rules as `wiki-ingest`: split so each
page answers one question, ~30–80 lines, propose the page structure and get
approval before writing, required frontmatter (`type`, `title`,
`description`, `sources`), reference-style repo-root-absolute links, every
page reachable from an `index.md`.

Two things are specific to vendored pages:

- **Every page carries `generated: true`** in its frontmatter (per OKF §5.2)
  — this marks it as synthesized rather than hand-authored, on top of the
  trust signal the `vendor/` path already gives.
- **`sources:` names the upstream material actually used** — the `llms.txt`
  URL, the specific doc file, the README, or the docs-site URL — not the
  package name alone.

```markdown
---
$schema: ../../_meta/page.schema.json
type: topic
title: react-native navigation basics
description: How screens are registered and transitioned between in react-native
generated: true
sources:
  - https://reactnative.dev/docs/navigation
---

One-paragraph answer, same as any concept page. Then detail, with the same
reference-style absolute links to the rest of the bundle.
```

## 3. State coverage honestly

At the top of the vendored section's index (or in a dedicated page if the
coverage story is nontrivial), say plainly what was synthesized, what parts
of upstream's documentation were **not** covered, and where confidence is
low. A synthesized bundle that quietly reads as authoritative is the main way
this feature does harm — an agent reading `vendor/` content should come away
knowing it is a best-effort synthesis, not upstream's own statement.

## 4. Record provenance

Add an entry under `vendor:` in `wiki-sticky.yaml` naming where the synthesis
came from:

```yaml
vendor:
  react-native:
    from: https://reactnative.dev/llms.txt
```

This is declarative provenance only — nothing re-fetches `from:`
automatically. It exists so a human can re-check the source later and so a
future `wiki-vendor` run knows what to refresh against.

## 5. Finish

Run `wiki-sticky lint` and fix findings, same as any other wiki write.

## The collision rule

If `wiki-sticky add <pkg>` later finds that the dependency now publishes a real
upstream bundle, it does not silently shadow the local synthesis — it
reports the collision and offers to retire `vendor/<pkg>/`. Take that offer:
a real upstream bundle in `deps/` is strictly more trustworthy than a
synthesis, and keeping both around invites confusion about which one an
agent should read.
