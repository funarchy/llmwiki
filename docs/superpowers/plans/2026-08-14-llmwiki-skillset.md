# llmwiki Skillset Implementation Plan (Plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the agent-facing half of llmwiki — the five skills (`wiki-ingest`, `wiki-search`, `wiki-eval`, `wiki-review`, `wiki-vendor`), the `skills sync` installer with hash-locking, lint check 12, the plugin manifest, and llmwiki's own dogfood bundle.

**Baseline:** branch `feat/skillset` off `main` at `140157a`; 298 tests passing.

**Spec:** design spec §12 (the skillset), §13 (skill installation), §11 check 12. **Out of scope:** registry, publishing, `git:` resolution, `extract`.

## The governing constraint

**The skills are written fresh from the design spec.** §14 records that the Funexpected implementation is input, not source material — open-sourcing it is unresolved, and this is the from-scratch rewrite. Every behavioural requirement a skill needs is in spec §12's table and prose, restated in Task 1 below. Do not consult, quote, or paraphrase any external skill implementation.

## File structure

| File | Responsibility |
| --- | --- |
| `skills/wiki-{ingest,search,eval,review,vendor}/SKILL.md` | the five canonical skills |
| `src/commands/skills.ts` | `skills sync`: install into `.claude/skills/` + `.agents/skills/`, hash into `Lock.skills`, honour `config.skills` modes |
| `src/commands/init.ts` | *(modify)* install skills at init time |
| `src/lint/checks/skills-current.ts` | check 12 — **warning severity** |
| `src/lint/checks/index.ts`, `test/lint/run.test.ts` | *(modify)* register; order array → 12 ids |
| `src/cli.ts` | *(modify)* register `skills sync` |
| `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json` | the `/plugin install` delivery path |
| `llmwiki/` + `llmwiki.yaml` (repo root) | the dogfood bundle: real `llmwiki init` run on this repository |
| `test/skills-drift.test.ts` | every `llmwiki <cmd>` mentioned in any SKILL.md must be a real CLI command |

---

## Task 1: The five skills

Each is `skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`) and a markdown body. The `description` doubles as the model-invocation trigger: it must say *when* to use the skill in concrete, recognisable situations, not just what it does. Bodies are step-structured procedures an agent follows verbatim. House rules that apply inside every skill body: the bundle root comes from `llmwiki.yaml` (never hardcode `llmwiki/` — say "the bundle root" and show how to find it); links are reference-style repo-root-absolute; `deps/` is upstream-authored and read-only; `vendor/` is locally-synthesized; finish by running `llmwiki lint`.

### `wiki-ingest` — the write path

The discipline the whole product rests on. Required procedure (spec §12):

1. **Classify the source**: no argument → ambient capture (knowledge from the current conversation — restate it for confirmation before recording); a first-party doc → migrate knowledge in, keep the file; a config/loader file → extract, offer to slim to a pointer only with confirmation; a URL or code path → synthesize and cite in `sources:`.
2. **Split aggressively**: each page answers exactly one question; ~30–80 lines; keep indivisible entities (a table with its column reference) together; for sources over ~100 lines propose a directory.
3. **Propose the structure and wait for explicit approval before writing anything** — an ASCII tree of pages with one-line purposes, plus the alternative of distributing into the existing structure.
4. Write pages per the schema: required frontmatter, `sources:` as ground truth (code paths, DB URIs, external URLs — never another wiki page, never a GitHub URL for in-repo code), one-paragraph answer up top, reference-style absolute links.
5. **Data-loss guard**: verify every material claim in the source is represented or deliberately dropped (say which); invoke `wiki-review` against source + new pages when migrating.
6. **Wire up**: every new page reachable from an `index.md`; cross-link bidirectionally with existing pages at the first natural mention, one link per target per page; refresh the entry-point files (root index, bundle README if present, `CLAUDE.md` pointer if the repo has one).
7. `llmwiki lint`, fix findings, one squashed commit: `[wiki] ingest: <subject> → <page(s)> (+links)`.

Dependency-aware rules: **refuses to write into `deps/**`** — when knowledge belongs to a dependency, say so and point at the producing repository. Owns extraction judgment: when a page's subject belongs upstream, propose moving it there (the moved page must not link back into this bundle — that would be a cycle). May write into `vendor/**` only via the `wiki-vendor` procedure.

### `wiki-search` — the read path

Answer a question strictly from the bundle. Navigate from the root `index.md` along links — do not grep the tree; the index structure is the router. Read every page landed on. Compose multi-page answers on the fly; cite every page used by path. Crosses into `deps/` and `vendor/` freely, and **reports which subtree each part of the answer came from** — "synthesized from their docs" (`vendor/`) must never read as "upstream said so" (`deps/`). After answering, surface gaps explicitly: missing page (suggest the ingest source), stale/incomplete page (suggest `wiki-ingest` or `wiki-review`), or nothing. Never silently answer from outside the wiki — going beyond it is itself a gap to report.

### `wiki-eval` — usability tests

Four modes on `<bundle-root>/_meta/eval/` case files (frontmatter: `question`, `added`, `status: to_resolve | satisfied`, optional `pages-needed`, `navigation`, `answer-must-mention`; body holds `## Correct answer` or `## Current wiki answer`):

- **add `<question>`**: derive a kebab-case filename, write a `to_resolve` case, link it from the eval index. Proactive trigger: run this automatically whenever a repo question was answered from general knowledge rather than a wiki page.
- **single run**: spawn a fresh navigator agent whose only source of truth is the bundle, starting at the root index, following only links. It reports navigation path, answer with quotes, and a verdict: FOUND / PARTIAL / NOT_FOUND. On FOUND, present for human confirmation before upgrading the case to `satisfied` (record navigation, answer, who confirmed). On PARTIAL/NOT_FOUND, record what the wiki currently says and which pages are needed.
- **batch (no args)**: run every case sequentially; check navigation paths and `answer-must-mention` phrases against stored expectations; flag regressions prominently; summary table.
- **list**: print cases with status and stored answers, no agents.

Dependency-aware rule: a failure attributable to `deps/` territory is an **upstream gap** — report it as belonging to the producing repository (in Funarchy terms: a pollution against that repo), never patch vendored pages.

### `wiki-review` — adversarial review

Advisory only: emit a report, never edit. Each finding quotes the specific lines, carries a confidence, and defaults to "no issue" — surface only findings you cannot talk yourself out of. Three checks: **data-loss** (source→pages, migration-time only: list material claims — facts, constraints, field names, table rows, caveats — and classify each Present / Missing / Intentionally dropped with rationale); **conflicts** (two pages asserting things a reader would act on differently — quote both sides; different levels of detail are not a conflict); **convention judgment** (opening paragraph actually answers the question; every sentence earns its place; no throat-clearing; no vibes adjectives; single-purpose pages; `sources:` are ground truth not prose; missing cross-links where a wiki-worthy concept is mentioned). Scope: the diff against the default branch, or explicit targets. **Never reviews `deps/**`** (not ours); **does review `vendor/**`** (ours). Mechanical link/format checks are `llmwiki lint`'s job, not this skill's.

### `wiki-vendor` — third-party synthesis

Synthesize a bundle for a dependency that ships none, into `<bundle-root>/vendor/<pkg>/`. Source priority: upstream `llms.txt` → the package's own `docs/` → its README → its published docs site. Every page carries `generated: true` (OKF §5.2) and `sources:` naming the upstream URLs or files actually used. **State coverage honestly** — what was synthesized, what upstream documents were not covered, where confidence is low; a synthesized bundle that quietly reads as authoritative is the main way this feature does harm. Record provenance in `llmwiki.yaml`'s `vendor:` section (`from:`). If `llmwiki add` later finds a real upstream bundle for the same package, the collision is reported — offer to retire the synthesis. Structure and linking follow the same rules as `wiki-ingest`; finish with `llmwiki lint`.

Verification for Task 1: each SKILL.md has valid frontmatter; a grep across all five for `futuramath|funexpected|scenepad|koota` returns nothing (fresh-from-spec check); every `llmwiki <cmd>` mentioned exists (Task 3's drift test enforces durably).

Commit: `feat: write the five skills from the design spec`.

---

## Task 2: `skills sync`

`src/commands/skills.ts`. Behaviour by `config.skills`:

- **`managed`** (default): copy each `skills/<name>/SKILL.md` from `packageRoot()` into `<repo>/.claude/skills/<name>/SKILL.md` AND `<repo>/.agents/skills/<name>/SKILL.md`, overwriting; record `sha256-<hex>` of each canonical file in `Lock.skills` (preserving `Lock.bundles` untouched — read-modify-write via `readLock`/`writeLock`).
- **`vendored`**: copy only skills not already present (never overwrite user edits); still record the *shipped* hashes in the lock.
- **`off`**: no-op with a message (the plugin path is in use).

Exported pieces: `shippedSkills(): string[]` (from `packageRoot()/skills/`), `skillHash(name): string`, `syncSkills(repoRoot, config): { installed: string[]; skipped: string[] }`, `skillsCommand(cwd, sub)` where `sub` must be `'sync'`.

CLI: `skills <sub>` command, erroring on anything but `sync`.

Tests (`test/commands/skills.test.ts`, ~7): managed installs all five into both trees and locks five hashes; re-sync overwrites a local edit under managed; vendored preserves a local edit; off leaves the tree untouched; lock's `bundles` survive a skills write (round-trip with a fake bundle entry); hashes are stable across two syncs; unknown subcommand errors.

Commit: `feat: add skills sync with hash locking`.

---

## Task 3: init wiring, check 12, drift test

- `src/commands/init.ts`: after scaffolding, call `syncSkills` (config just written is `managed` by default) and report what was installed. `InitResult` gains `skillsInstalled: string[]`.
- `src/lint/checks/skills-current.ts` — check 12, **severity `'warning'` always** (a stale skill must never fail CI — spec §11): when `config.skills` is `off` → silent; otherwise for each shipped skill compare `Lock.skills[name]` against the current shipped hash → warn `skill "<name>" is out of date — run llmwiki skills sync`; a shipped skill absent from the lock → warn similarly; under `vendored`, only lock-vs-shipped drift is reported (user edits to installed copies are expected and not compared).
- Register as id `skills-current` after `root-links-deps`; run.test order array → 12 ids.
- `test/skills-drift.test.ts`: parse every `skills/*/SKILL.md` for `` `llmwiki <word>` `` mentions; assert each word is a registered CLI command (source the list by regexing `src/cli.ts` for `.command('...')` — brittle-but-honest is fine at this scale).

Tests: check 12 warns on stale hash, warns on missing lock entry, silent when current, silent when `off`, exit code stays 0 when it is the only finding; init installs skills; drift test green. (~7 tests)

Commit: `feat: wire skills into init and lint as check 12`.

---

## Task 4: Plugin manifest

`.claude-plugin/plugin.json` (name `llmwiki`, description, version mirroring `package.json`) and `.claude-plugin/marketplace.json` (single-entry marketplace pointing at this repo's plugin with the five skills). Keep both minimal and honest — this is the alternative delivery path (spec §13: one source, two delivery paths); the skills themselves are the same files. Add both to `package.json#files`. One test: both parse as JSON and the plugin's skill list matches `shippedSkills()`.

Commit: `feat: ship the plugin manifest delivery path`.

---

## Task 5: The dogfood bundle

Run the real `node dist/cli.js init --yes` on **this repository**, then replace the template root index with a real bundle about llmwiki itself, written per the skills' own rules. Pages (each 30–80 lines, one question each):

- `format/` — `page-anatomy.md`, `index-files.md`, `links.md` (the absolute+reference rule and why), `meta-pages.md`
- `commands/` — `lint.md` (the 12 checks, what fails vs warns), `install.md` (deps, lock, frozen), `add-rm-update.md`, `init.md`
- `composition/` — `deps-and-vendor.md` (the trust split), `rewriting.md` (prefix substitution, why absolute links make it work), `conflicts.md` (flat hoist, hard failures)
- `skills/` — `overview.md` (the five skills and when each triggers)

Every page's `sources:` points at real repo paths (`src/lint/checks/`, `docs/superpowers/specs/2026-08-13-llmwiki-design.md`, …). Indexes wire everything; root index links the sections. **`llmwiki lint` must exit 0 on this repository** — that is the dogfood claim. `init` will also have added `llmwiki`/`llmwiki.yaml` to `package.json#files`: keep that (the bundle ships in the tarball, making llmwiki's own knowledge consumable as a dep) and keep the pre-commit hook it installs. Skills land in `.claude/skills/` + `.agents/skills/` via init's sync — commit those too (they are this repo's own working copies).

Commit: `feat: dogfood — llmwiki's own bundle, lint-clean`.

---

## Task 6: Integration, docs, merge readiness

- `test/integration/skills.test.ts` (~4): `init --yes` in a temp repo installs five skills in both trees and locks hashes; corrupt one installed skill + `skills sync` restores it (managed); `lint` warns-not-fails on a stale skill hash; `skills sync` under `off` is a no-op.
- Docs: spec Status → all three plans implemented; README gains a Skills section (what the five do, `skills sync`, the plugin path) and drops "agent skillset is next" from Status.
- Full suite twice; typecheck; then merge `feat/skillset` → `main` (`--no-ff`).

## Definition of done

- [ ] five skills, fresh-from-spec (grep guard), triggers in descriptions
- [ ] `skills sync` honours all three modes; lock carries skill hashes without disturbing bundles
- [ ] check 12 registered, warning-only, 12-id order asserted
- [ ] drift test binds skill prose to real CLI commands
- [ ] plugin manifests ship in the tarball
- [ ] **this repository lints clean with its own bundle**
- [ ] suite green ×2, typecheck clean, docs synced, merged
