# Closing PR #2's acceptance-criteria gaps

**Date:** 2026-08-15
**Status:** Approved design, ready for planning
**Context:** A review of PR #2 against pollution #1's acceptance criteria
found four criteria verified and three with gaps. This spec closes the
three gaps on the same branch (`solution/llmwiki-v1`) before merge.

## The gaps

1. **The gate is not wired on this repository.** No `.github/` exists;
   nothing runs the tests, `llmwiki lint`, or `install --frozen` on the
   PR. The only gate is the untracked per-clone pre-commit hook — and in
   this repository it permanently no-ops, because the shipped template
   only looks for `node_modules/.bin/llmwiki` and llmwiki is not a
   dependency of itself. Criterion: "malformed pages … fail a check the
   same way failing tests do." Today nothing would fail.
2. **Zero eval cases.** `_meta/eval/` holds only the index template, so
   `llmwiki gaps` printing "(none)" is vacuous and the navigability
   criterion ("usability itself is testable") is untested on the one
   bundle that exists.
3. **No artifact for the instructions/knowledge separation.** Criterion 3
   asks that instruction files keep genuine instructions plus a pointer
   to the knowledge. This repository has no instruction file at all, and
   `init` writes no pointer — the positive half of the criterion is
   neither implemented nor demonstrated.

Criterion 6 (one-command install) remains honestly flagged in the PR as
from-checkout-only; publishing to npm is a separate decision and out of
scope here.

## Decisions taken

- **Scope:** close all three gaps on PR #2 before merge.
- **Pointer (gap 3):** *demonstrate only.* No tool change; this
  repository gets the artifact. llmwiki keeps policing the bundle, not
  instruction files.
- **Gate (gap 1):** *CI is the real gate; the hook learns one
  fallback.* The shipped template prefers `node_modules/.bin/llmwiki`,
  falls back to `node dist/cli.js lint` when the repository is a
  checkout of llmwiki itself, and keeps the warn-and-pass path
  otherwise (a hook that blocks every commit teaches people to delete
  hooks).
- **Evals (gap 2):** *six cases, one left `to_resolve`.* Five real
  navigator runs recorded `satisfied`; one question the bundle
  genuinely cannot answer left open so `llmwiki gaps` prints a real
  gap and the workflow is demonstrated end to end.

## Design

### 1. CI workflow

`.github/workflows/ci.yml`, one job on `ubuntu-latest`, Node 20:

```
npm ci
npm run build
npm run typecheck
npx vitest run
node dist/cli.js lint
node dist/cli.js install --frozen
```

`install --frozen` makes the lock — bundle hashes *and* skill hashes — a
CI-verified artifact on every PR: the "tampered vendored knowledge fails
a check" claim, running mechanically.

### 2. Pre-commit hook fallback

`templates/pre-commit.sh` gains a second branch:

```sh
if [ -x "$root/node_modules/.bin/llmwiki" ]; then
  exec "$root/node_modules/.bin/llmwiki" lint
elif [ -f "$root/dist/cli.js" ]; then
  exec node "$root/dist/cli.js" lint    # from-checkout (dogfood) case
else
  # warn and exit 0, as today
fi
```

Still purely local: no npx, no network. Accompanying changes:

- `test/templates.test.ts` pins the fallback (and keeps pinning the
  absence of `npx`).
- This clone's installed `.git/hooks/pre-commit` is refreshed from the
  new template so the dogfood gate actually fires.
- `llmwiki/commands/init.md` is updated where it describes the hook's
  behaviour.

### 3. Instruction-file artifact

- New `AGENTS.md` at the repository root: genuine instructions only
  (build/test/lint commands, plan-doc conventions) plus the knowledge
  pointer — knowledge lives in `/llmwiki/`, start at
  `/llmwiki/index.md`, navigate with the wiki-search skill, do not copy
  knowledge into this file.
- One-line `CLAUDE.md` pointing at `AGENTS.md`.
- No tool change. This is the demonstration artifact for criterion 3.

### 4. Eval suite

Six case files under `llmwiki/_meta/eval/`, each linked from the eval
index, following the case-file shape in `skills/wiki-eval/SKILL.md`:

- **Five `satisfied` cases**, spread across format, commands,
  composition, skills, and one cross-subtree question. Each is resolved
  by a *fresh navigator subagent run*: the navigator gets the question
  and the instruction to start at `llmwiki/index.md` and follow links
  only — no grep, no outside knowledge. The recorded case carries the
  real `navigation` path and `answer-must-mention` terms from that run.
- **One `to_resolve` case**: a question the bundle genuinely cannot
  answer today, with `pages-needed` filled in, so `llmwiki gaps` prints
  a real gap.

Honesty rule: a navigator verdict of `PARTIAL` or `NOT_FOUND` on an
intended-satisfied question is itself a finding. Record it — fix the
page it exposes or leave the case `to_resolve` — never reshape the
question until it passes.

## Verification

- `npm run build`, `npm run typecheck`, `npx vitest run` — all green.
- `node dist/cli.js lint` — clean (the new eval pages must lint).
- `node dist/cli.js gaps` — prints exactly one open gap (the
  `to_resolve` case), no stub pages.
- `sh .git/hooks/pre-commit` in this clone — runs lint via the
  `dist/cli.js` fallback and exits by lint's verdict, not 0-by-skip.
- PR #2's body checklist updated to cite the new artifacts (CI run,
  eval cases, AGENTS.md) before push.

## Non-goals

- npm publishing (criterion 6's remaining half) — separate decision.
- `init` writing or linting instruction-file pointers — rejected in
  favour of demonstrate-only.
- Broad eval coverage (12+ cases) — six cases establish the practice;
  growth is `wiki-eval`'s proactive trigger's job.
