---
$schema: _meta/page.schema.json
type: topic
title: Releasing wiki-sticky
description: The gated release routine — who starts it, what approves it, what lands atomically
tags: [releasing, ci]
sources:
  - .github/workflows/release.yml
  - scripts/sync-plugin-version.mjs
  - package.json
---

A release is started with one action against merged `main` and executed
entirely in CI (`.github/workflows/release.yml`) — no local checkout,
branch, or npm login is involved:

```bash
gh workflow run release -f bump=patch   # or minor / major
```

The workflow then: waits for a browser approval (the `release`
environment requires a reviewer); runs the full gate — build,
typecheck, tests, `wiki-sticky lint`, `install --frozen` — before
anything irreversible; bumps the version with `npm version`, whose
`version` lifecycle hook (`scripts/sync-plugin-version.mjs`) mirrors
the new number into `.claude-plugin/plugin.json` inside the same
commit; pushes that commit and its `v<version>` tag to `main`
together; and publishes to npm via trusted publishing (OIDC) with
`--provenance`. A red gate stops before the push, so a failed release
leaves no half-released state — and no npm token exists anywhere,
in CI or on a laptop.

Never release by hand from a checkout: a local `npm version` commit
cannot be pushed to protected `main`, and a local `npm publish` needs
an interactive 2FA prompt — both are what this routine exists to
replace.

One-time operator setup, all in the browser: a `release` environment
with a required reviewer (repository settings); a ruleset bypass
letting this workflow push its version commit to `main`; and the
trusted-publisher entry for `wiki-sticky` on npmjs.com (repository
`funarchy/wiki-sticky`, workflow `release.yml`, environment
`release`).
