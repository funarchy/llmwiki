---
$schema: ../_meta/page.schema.json
type: topic
title: The five skills
description: What each of the five wiki- skills does and the concrete situation that should trigger it
tags: [skills]
sources:
  - skills/wiki-ingest/SKILL.md
  - skills/wiki-search/SKILL.md
  - skills/wiki-eval/SKILL.md
  - skills/wiki-review/SKILL.md
  - skills/wiki-vendor/SKILL.md
  - src/commands/skills.ts
---

wiki-sticky ships five model-invoked skills, canonically `skills/wiki-*/SKILL.md`
in this repository, installed into a consumer's `.claude/skills/` and
`.agents/skills/` by `wiki-sticky init` or `wiki-sticky skills sync`
(`src/commands/skills.ts`) — or delivered as a plugin instead (see
`.claude-plugin/`). The governing rule: if the answer is computable it's a
CLI command; if it needs judgment it's a skill.

- **`wiki-ingest`** — the write path. Triggers when knowledge should be
  recorded: something just explained in conversation (ambient capture,
  confirmed before writing), a doc being migrated, a config file whose
  meaning should be extracted, or a URL or code path that took real effort
  to derive. Classifies the source, splits aggressively (~30–80 lines per
  page, one question each), proposes a structure and waits for approval,
  writes pages, checks for data loss on a migration, wires up indexes and
  cross-links, then lints and makes one squashed commit. Refuses to write
  into `deps/**`.

- **`wiki-search`** — the read path. Triggers on any "how does X work" /
  "where is Y decided" question this bundle could answer instead of general
  knowledge or a plain code search. Navigates from the root index by
  following links only (never greps the tree), reads every page landed on,
  composes an answer citing every page used, and reports which subtree
  (own pages, `deps/`, `vendor/`) each part came from — never blurring
  "upstream said so" with "we synthesized this."

- **`wiki-eval`** — usability tests. `add <question>` records a new
  `to_resolve` case — triggered proactively whenever a repository question
  just got answered from general knowledge instead of a wiki page. A
  single run spawns a fresh navigator agent to check one case; batch runs
  every case and flags regressions; `list` prints case status with no
  agents spawned.

- **`wiki-review`** — adversarial, advisory-only. Triggers after a
  migration ingest or when judging whether pages still meet convention.
  Never edits pages, only reports: data loss against a migration source,
  inter-page conflicts a reader would act on differently, and convention
  judgment (does the opening paragraph answer the question, does every
  sentence earn its place). Never reviews `deps/**`; does review
  `vendor/**`. Mechanical link/format problems are `wiki-sticky lint`'s job,
  not this skill's.

- **`wiki-vendor`** — third-party synthesis. Triggers when a dependency
  ships no bundle of its own and its docs should become navigable. Sources
  in priority order: upstream `llms.txt`, the package's own `docs/`, its
  README, its published docs site. Every page carries `generated: true`;
  coverage gaps and low-confidence areas are stated honestly rather than
  left implicit.

This repository's own copies under `.claude/skills/` and `.agents/skills/`
are this repository's dogfood: they're the same files `shippedSkills()`
reads from `skills/` at the package root, hash-locked in
`wiki-sticky-lock.json`'s `skills` section and checked for drift by lint check
12 (`skills-current`), which only ever warns.
