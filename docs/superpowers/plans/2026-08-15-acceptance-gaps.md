# Acceptance-Gaps Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Per the spec's model-economy rule this plan is executed **inline** (the edits sit below the delegation floor); the only spawned agents are the Haiku eval navigators in Task 4.

**Goal:** Close PR #2's three acceptance-criteria gaps — CI gate + hook fallback, AGENTS.md pointer artifact, seeded eval suite — per `docs/superpowers/specs/2026-08-15-acceptance-gaps-design.md`.

**Architecture:** Four independent deliverables on `solution/llmwiki-v1`: a GitHub Actions workflow that runs the full gate; a pre-commit template that gains a guarded from-checkout fallback (TDD via `test/templates.test.ts`); two instruction files demonstrating the instructions/knowledge separation; six eval case files under `llmwiki/_meta/eval/` resolved by fresh Haiku navigator subagents with human sign-off before any case is recorded `satisfied`.

**Tech Stack:** GitHub Actions, POSIX sh, vitest, the llmwiki CLI itself (`dist/cli.js`), Agent-tool navigator subagents on `claude-haiku-4-5`.

**Repo facts the engineer needs:**

- Working directory: `/Users/jkbo/funarchy/llmwiki`, branch `solution/llmwiki-v1` (PR #2's head — pushes update the PR).
- `_meta/` is excluded from the lint page model (`EXCLUDED_DIRS`, `src/bundle/load.ts:8`), so eval case files are exempt from the kebab-case/frontmatter/orphan checks. Use kebab-case names anyway — the wiki-eval skill requires it.
- `llmwiki gaps` (`src/commands/gaps.ts`) lists a case iff its frontmatter has `status: to_resolve`; `pages-needed` is read as a list.
- The pre-commit hook installed in this clone (`.git/hooks/pre-commit`) is a copy of the old template; refreshing it is a manual `cp` (nothing re-installs it).
- Every commit message ends with the `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` trailer (harness convention; shown once here, required on all commits below).

---

### Task 1: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - run: npm run typecheck
      - run: npx vitest run
      - run: node dist/cli.js lint
      - run: node dist/cli.js install --frozen
```

- [ ] **Step 2: Prove the sequence locally (CI can't run pre-push)**

Run: `npm ci && npm run build && npm run typecheck && npx vitest run && node dist/cli.js lint && node dist/cli.js install --frozen && echo GATE-GREEN`

Expected: `323 passed`, `llmwiki lint ✓  no issues`, final line `GATE-GREEN`. (`npm ci` re-creates `node_modules` from the lockfile — expected to take a minute.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run the full gate — build, typecheck, tests, lint, frozen install"
```

---

### Task 2: Pre-commit fallback for the from-checkout case

**Files:**
- Modify: `templates/pre-commit.sh`
- Modify: `test/templates.test.ts:19-24` (the pre-commit test)
- Modify: `llmwiki/commands/init.md` (the hook paragraph)
- Refresh: `.git/hooks/pre-commit` (this clone's installed copy)

The fallback must not hijack a *consumer* repo that happens to have its own `dist/cli.js` — it only fires when the repo IS llmwiki (checked via `package.json` name).

- [ ] **Step 1: Extend the template test to pin the fallback**

Replace the existing pre-commit test in `test/templates.test.ts` with:

```ts
  it('pre-commit.sh guards against llmwiki not being installed, with a from-checkout fallback and no network calls', () => {
    const content = readFileSync(join(packageRoot(), 'templates', 'pre-commit.sh'), 'utf-8');
    expect(content).toContain('node_modules/.bin/llmwiki');
    // The dogfood fallback: a built checkout of llmwiki itself...
    expect(content).toContain('dist/cli.js');
    // ...and only llmwiki itself — never a consumer's own dist/cli.js.
    expect(content).toContain('"name": "llmwiki"');
    expect(content).not.toContain('npx');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/templates.test.ts`
Expected: FAIL — `expected ... to contain 'dist/cli.js'`.

- [ ] **Step 3: Rewrite the template**

`templates/pre-commit.sh`, full new content:

```sh
#!/bin/sh
# Installed by `llmwiki init`. Blocks a commit when the bundle fails lint.
# Prefer the installed binary; fall back to a built checkout of llmwiki
# itself (the dogfood case — package.json must name llmwiki, so a
# consumer's own dist/cli.js is never executed). If neither exists, warn
# and let the commit through — a hook that blocks every commit teaches
# people to delete hooks, not to install linters. The check is purely
# local: no registry resolution, no network, no hang when the registry
# is unreachable.
root="$(git rev-parse --show-toplevel)"
if [ -x "$root/node_modules/.bin/llmwiki" ]; then
  exec "$root/node_modules/.bin/llmwiki" lint
elif [ -f "$root/dist/cli.js" ] && grep -q '"name": "llmwiki"' "$root/package.json" 2>/dev/null; then
  exec node "$root/dist/cli.js" lint
else
  echo "pre-commit: llmwiki is not installed in this repository; skipping bundle lint." >&2
  echo "pre-commit: npm install --save-dev llmwiki   (to enable the gate)" >&2
  exit 0
fi
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Refresh this clone's installed hook and prove it gates**

```bash
cp templates/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
sh .git/hooks/pre-commit; echo "exit=$?"
```

Expected: `llmwiki lint ✓  no issues` then `exit=0` — the fallback branch ran lint instead of skip-and-warn. Negative check: temporarily break a page (`echo x >> llmwiki/format/links.md`), rerun the hook, expect nonzero exit and a lint error, then `git checkout -- llmwiki/format/links.md`.

- [ ] **Step 6: Update the bundle's description of the hook**

In `llmwiki/commands/init.md`, replace the sentences describing the binary check (from "It is deliberately non-blocking" through "does it `exec llmwiki lint`.") with (keep ~72-char wrapping):

```markdown
It is deliberately non-blocking when llmwiki isn't actually usable: it
runs `node_modules/.bin/llmwiki lint` when that binary exists, falls
back to `node dist/cli.js lint` when the repository is a built checkout
of llmwiki itself (guarded by the package name, so a consumer's own
`dist/cli.js` is never executed), and otherwise prints a skip message
and exits 0 rather than failing every commit in a repository where
llmwiki isn't installed.
```

- [ ] **Step 7: Full verification and commit**

Run: `npm run build && npx vitest run && node dist/cli.js lint`
Expected: all green (the commit itself now also runs lint via the refreshed hook).

```bash
git add templates/pre-commit.sh test/templates.test.ts llmwiki/commands/init.md
git commit -m "fix: pre-commit falls back to dist/cli.js in a checkout of llmwiki itself"
```

---

### Task 3: AGENTS.md + CLAUDE.md pointer artifact

**Files:**
- Create: `AGENTS.md`
- Create: `CLAUDE.md`

- [ ] **Step 1: Write `AGENTS.md`**

```markdown
# AGENTS.md

Instructions for agents working in this repository. Knowledge does not
live here — see the last section.

## Build, test, lint

- `npm run build` — compile TypeScript to `dist/`
- `npm run typecheck` — typecheck sources and tests together
- `npx vitest run` — the full test suite; must be green before a commit
- `node dist/cli.js lint` — lint this repository's own bundle (dogfood)
- `node dist/cli.js install --frozen` — verify the lock matches (CI)

Run the build before the CLI commands — `dist/` is what executes. CI
(`.github/workflows/ci.yml`) runs exactly this sequence; the pre-commit
hook runs lint locally.

## Conventions

- Specs live in `docs/superpowers/specs/`, implementation plans in
  `docs/superpowers/plans/`. Plans are the durable record of what was
  built and why; amend them when reviews find spec defects.
- The five agent skills under `skills/wiki-*/SKILL.md` are the
  canonical copies; `.claude/skills/` and `.agents/skills/` are
  installed copies, synced by `llmwiki skills sync` and hash-locked in
  `llmwiki-lock.json`. Edit the canonical copy, then sync.

## Knowledge

This repository's knowledge lives in its llmwiki bundle at
[/llmwiki/](llmwiki/index.md), not in this file. Start at
`llmwiki/index.md` and navigate by links — the wiki-search skill is the
read path. Do not copy knowledge into this file; add or update a bundle
page instead (wiki-ingest is the write path).
```

- [ ] **Step 2: Write `CLAUDE.md`**

```markdown
Read [AGENTS.md](AGENTS.md) — the single instruction file for this
repository. Knowledge lives in the llmwiki bundle it points to.
```

- [ ] **Step 3: Verify lint is untouched and commit**

Run: `node dist/cli.js lint`
Expected: clean (both files live outside the bundle root).

```bash
git add AGENTS.md CLAUDE.md
git commit -m "docs: AGENTS.md carries instructions plus the knowledge pointer (criterion 3)"
```

---

### Task 4: Eval suite — six cases, five navigator-verified

> **Amendment (2026-08-15, during execution):** seven cases shipped, not
> six. The intended-gap question (producer packaging) came back FOUND —
> but only via a 17-page full-bundle walk, recorded `satisfied` with
> that navigability smell noted in its body. The `to_resolve` case
> became a gap actually discovered during the runs: the `gaps` command
> has no bundle page (`pages-needed: llmwiki/commands/gaps.md`). Also,
> Step 5's negative hook check in Task 2 was too weak as written (a
> stray text line violates no lint check); executed with an inline
> broken link instead, which trips checks 4 and 7.

**Files:**
- Create: `llmwiki/_meta/eval/how-does-lint-tamper-proof-vendored-knowledge.md`
- Create: `llmwiki/_meta/eval/what-distinguishes-deps-from-vendor.md`
- Create: `llmwiki/_meta/eval/what-happens-on-a-version-conflict.md`
- Create: `llmwiki/_meta/eval/what-frontmatter-must-a-page-carry.md`
- Create: `llmwiki/_meta/eval/how-are-skills-installed-and-kept-current.md`
- Create: `llmwiki/_meta/eval/how-does-a-producer-prepare-its-bundle-for-consumers.md`
- Modify: `llmwiki/_meta/eval/index.md`

**The six questions** (five intended-`satisfied` spanning the bundle's four subtrees, one intended-`to_resolve`):

1. *How does lint make sure vendored knowledge hasn't been tampered with, and which lint checks only warn?* (commands)
2. *What is the difference between the deps/ and vendor/ directories, and who writes into each?* (composition)
3. *What happens when two dependencies require different versions of the same knowledge bundle?* (composition/conflicts)
4. *What frontmatter must a wiki page carry, and which files are exempt?* (format)
5. *How do the agent skills get installed, and what keeps them current?* (skills — cross-subtree with commands via `skills sync` / check 12)
6. *What must a producer repository do to its npm package so consumers can install its bundle?* (expected gap — the bundle documents consuming, not producing)

- [ ] **Step 1: Run six fresh Haiku navigators (one Agent call each, all six in parallel, `model: "haiku"`)**

Prompt template — substitute the question, nothing else:

```text
You are testing whether a documentation bundle is navigable. Answer this
question using ONLY the markdown files under /Users/jkbo/funarchy/llmwiki/llmwiki/:

QUESTION: <question>

Rules: Start by reading /Users/jkbo/funarchy/llmwiki/llmwiki/index.md.
Follow links from page to page — read every page you open in full. Do
NOT use grep, glob, or any search tool; do NOT read files outside that
directory; do NOT use outside knowledge of any product.

Report exactly: (1) NAVIGATION: the ordered list of pages you read, as
paths relative to the llmwiki/ directory; (2) ANSWER: your answer, with
short quotes of the supporting text and the page each quote came from;
(3) VERDICT: FOUND if the pages fully answered the question, PARTIAL if
only part was answerable, NOT_FOUND if the bundle does not answer it.
```

- [ ] **Step 2: Triage verdicts honestly**

Expected: cases 1–5 `FOUND`, case 6 `NOT_FOUND` or `PARTIAL`. If any of 1–5 comes back `PARTIAL`/`NOT_FOUND`, that is a finding: report it to the user and either fix the exposed page (then rerun that one navigator) or record the case `to_resolve` — never reword the question to make it pass. If case 6 comes back `FOUND`, report that too and pick a genuinely unanswerable replacement with the user.

- [ ] **Step 3: CHECKPOINT — human sign-off**

Present each navigator's answer + navigation path to the user. Only cases the user confirms correct are recorded `satisfied` (the skill's rule: record who confirmed).

- [ ] **Step 4: Write the six case files**

Shape for a `satisfied` case (fill `navigation`, `answer-must-mention`, and the answer from the actual run; `navigation` paths are bundle-root-relative, per the wiki-eval skill's examples):

```markdown
---
question: How does lint make sure vendored knowledge hasn't been tampered with, and which lint checks only warn?
added: 2026-08-15
status: satisfied
navigation: [index.md, commands/index.md, commands/lint.md]
answer-must-mention: [vendored-lock, re-derives, byte-for-byte, skills-current, warning]
---

## Correct answer

<2–5 sentences distilled from the navigator's answer>; confirmed by
jkbo on 2026-08-15.

Navigator: claude-haiku-4-5, fresh session, links-only from the root
index.
```

Shape for the `to_resolve` case:

```markdown
---
question: What must a producer repository do to its npm package so consumers can install its bundle?
added: 2026-08-15
status: to_resolve
pages-needed:
  - llmwiki/commands/publishing-a-bundle.md
---

## Current wiki answer

<what the navigator found, or "No page addresses this">. The bundle
documents the consumer side (add/install/update); nothing covers what
the producer ships (package.json#files carrying the bundle root and
llmwiki.yaml — what init writes into a producer's package.json).

Navigator: claude-haiku-4-5, fresh session, links-only from the root
index.
```

- [ ] **Step 5: Link the cases from the eval index**

Append to `llmwiki/_meta/eval/index.md`:

```markdown

## Cases

- [How does lint tamper-proof vendored knowledge?](how-does-lint-tamper-proof-vendored-knowledge.md)
- [What distinguishes deps/ from vendor/?](what-distinguishes-deps-from-vendor.md)
- [What happens on a version conflict?](what-happens-on-a-version-conflict.md)
- [What frontmatter must a page carry?](what-frontmatter-must-a-page-carry.md)
- [How are skills installed and kept current?](how-are-skills-installed-and-kept-current.md)
- [How does a producer prepare its bundle for consumers?](how-does-a-producer-prepare-its-bundle-for-consumers.md) *(open)*
```

- [ ] **Step 6: Verify gaps and lint**

Run: `node dist/cli.js gaps`
Expected: exactly one open gap (the producer question) listing its `pages-needed`; "(none)" under stub pages.

Run: `node dist/cli.js lint`
Expected: clean (`_meta/` is excluded from the page model).

- [ ] **Step 7: Commit**

```bash
git add llmwiki/_meta/eval/
git commit -m "eval: seed six navigator-verified cases; one honest open gap"
```

---

### Task 5: Final verification, PR body, push

- [ ] **Step 1: Full gate, exactly as CI will run it**

Run: `npm run build && npm run typecheck && npx vitest run && node dist/cli.js lint && node dist/cli.js install --frozen && node dist/cli.js gaps`
Expected: 323+ tests pass, lint clean, frozen install silent, gaps shows the one open case.

- [ ] **Step 2: Update PR #2's body**

Amend two checklist bullets (via `gh pr edit 2 --body-file <file>` after editing the current body):

- *Mechanically gated*: add — "CI (`.github/workflows/ci.yml`) runs build/typecheck/tests/lint/`install --frozen` on every PR; the pre-commit template gates from-checkout clones too; `_meta/eval/` now holds six cases (five Haiku-navigator-verified `satisfied`, one honest open gap that `llmwiki gaps` reports)."
- *Instructions separated from knowledge*: add — "demonstrated in-repo: `AGENTS.md` carries genuine instructions plus the pointer into `llmwiki/`; `CLAUDE.md` is one line pointing at `AGENTS.md`."

- [ ] **Step 3: Push**

```bash
git push origin solution/llmwiki-v1
```

Then: `gh run watch` (or `gh pr checks 2 --watch`) until the new CI workflow completes green — the first real run of the gate.

- [ ] **Step 4: Report**

Report to the user: CI run URL + conclusion, final `gaps` output, and the three gap-closures mapped back to #1's criteria.
