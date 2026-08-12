# llmwiki — design

**Date:** 2026-08-13
**Status:** approved design, not yet implemented

## 1. What llmwiki is

A knowledge base that lives in the repository — topic pages with a schema,
explicit links, and automated correctness checks — plus **the dependency layer
that lets one repository's knowledge base consume another's**.

Two halves, and the second is the new one:

- **A bundle format.** OKF-conformant markdown pages under a bundle root,
  navigated by agents along explicit links rather than similarity search, and
  read and maintained by humans through normal review.
- **A composition layer.** `npx llmwiki add @funarchy/scenepad` pulls
  scenepad's knowledge base into this repository so pages here can link to it,
  agents here can navigate into it, and its version can never drift from the
  version of scenepad's code that is actually installed.

llmwiki ships as an npm CLI (`npx llmwiki`) and an installable skillset.

## 2. Relationship to OKF

[OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
v0.2 defines the page format. It explicitly lists as **non-goals**:
dependencies between bundles, imports and composition, central registries, and
packaging. That is exactly the hole llmwiki fills.

| Layer | Owner |
| --- | --- |
| Page anatomy, frontmatter families, index files, versioning | OKF v0.2 |
| Stricter schema — `type`, `title`, `description`, `sources` all required | llmwiki |
| Reference-style relative links only | llmwiki |
| Bundle identity, dependency declaration, resolution, vendoring | **llmwiki** |
| Mechanical lint | llmwiki CLI |
| Ingest / search / eval / review / vendor discipline | llmwiki skills |

OKF requires only `type`, permits producer-defined fields, and requires
consumers to tolerate unknown keys. Requiring *more* than OKF therefore keeps
llmwiki bundles conformant while making them interchangeable in practice.

Implementing a published spec rather than a bespoke format is also the cheapest
answer to "why should I adopt your markdown convention."

## 3. Bundle anatomy

### 3.1 Concept pages

Every concept page is `kebab-case.md` with YAML frontmatter and a markdown
body.

```markdown
---
$schema: ../_meta/page.schema.json
type: topic
title: PMS runtime
description: How channel(), system() and presentation() wire together at runtime
tags: [pms, runtime]
sources:
  - src/pms/runtime.ts
---

One-paragraph answer to "what do I do", up top. Then detail. Link neighbours
in prose: see [the ownership rules][ownership].

[ownership]: ownership.md
```

Required frontmatter: `type`, `title`, `description`, `sources`. `tags` is
optional. There is no `updated:` field — when a page last changed comes from
`git log`, which cannot drift.

`sources:` names something a claim can be re-verified against: a repo-relative
code path, a database collection, a config file, or a genuinely external URL.
Never another page in the bundle — link that in the body instead. Never a
GitHub URL for code in the same repository — use the repo-relative path.

Page types are OKF's. llmwiki uses `topic` (answers one question — the default)
and `meta` (about the bundle itself; lives in `_meta/`).

### 3.2 Index files

`index.md` files are directory routers, not concept pages. Per OKF §8 they
carry **no frontmatter**, except that the bundle root's `index.md` may declare
`okf_version`. The body is a heading plus a bullet list, one entry per child:

```markdown
# Section title

* [Child title](child.md) - one-line description from the child's frontmatter
* [Subdirectory](subdir/index.md) - one-line description
```

Separator is ` - ` (space-hyphen-space), not an em dash.

### 3.3 Links

**Every link in a page body must be reference-style with a relative path.**

```markdown
See [the data router][data-router].

[data-router]: ../data/index.md
```

No inline `[text](url)` in bodies. No leading-slash paths — GitHub resolves
those against the domain root and 404s. No `[[wikilinks]]`.

This is not a style preference. It is load-bearing three times over:

1. It renders on GitHub, resolves for an agent reading files, and validates
   with no configuration — the only link form that does all three.
2. Moving a page breaks its links, and the lint gate catches the break in the
   same pull request. Fragility plus a gate beats a resilient syntax with no
   gate.
3. **It is what makes composition tractable.** Because every link is a
   `[ref]: path` definition in a page footer, rewriting cross-bundle links
   during vendoring (§7.3) is a line-level transform, not markdown AST surgery.

Index files use inline links, matching OKF §8.

## 4. Bundle identity: no new manifest file

A bundle's identity and dependencies come from files that already exist.

- **name and version** come from the host `package.json`. Not a copy of it —
  it. There is exactly one version number, so a bundle's knowledge version can
  never drift from its code version.
- **declared dependencies** come from the producer's own `llmwiki.yaml`.

`llmwiki init` adds the bundle root and `llmwiki.yaml` to `package.json#files`
so both ride along in the published tarball. When futuramath vendors scenepad
it reads `node_modules/@funarchy/scenepad/{package.json,llmwiki.yaml}`.

A repository outside the npm ecosystem may still author a bundle by declaring
`bundle.name` and `bundle.version` in `llmwiki.yaml` directly. It can consume
only `path:` dependencies until `git:` resolution lands (§17).

## 5. Bundle root and the three subtrees

The bundle root defaults to **`llmwiki/`**. `init` prompts for it, and when it
finds a plausible existing bundle (`wiki/`, `docs/wiki/`) it offers to adopt or
rename that instead of creating a second one.

```
llmwiki/
  index.md                  root router; must link deps/ and vendor/ when present
  _meta/
    page.schema.json
    eval/                   eval cases (this repo's only)
  stack/  data/  …          this repo's pages. writable.
  deps/                     upstream-authored, vendored. READ-ONLY.
    index.md                GENERATED — name, version, provenance per bundle
    @funarchy/scenepad/
    @funarchy/koota-pms/    hoisted transitive dependency, flat
  vendor/                   THIS repo's synthesis of a third party's docs. writable.
    index.md                GENERATED
    react-native/           pages marked generated: per OKF §5.2
```

**The path encodes trust.** `deps/` means *upstream said this*. `vendor/` means
*we inferred this from upstream's documentation*. An agent reading a page can
weigh it correctly from its location alone, with no metadata lookup.

The root name is per-repository, so **it is normalized at the vendor
boundary**. scenepad may keep `wiki/` while its consumer uses `llmwiki/`; the
consumer reads the dependency's `llmwiki.yaml` to find its root and always
lands the content at `<my-root>/deps/<name>/`. Paths inside a vendored bundle
never depend on what the producer called their root.

Eval cases live only in the consumer. A consumer's eval case may navigate into
dependency territory — that legitimately tests whether *this* repository can
answer a question from composed knowledge — but a failure attributable to a
dependency is labelled an upstream gap (§13).

## 6. Configuration

### 6.1 `llmwiki.yaml`

Hand-edited. Validated against a shipped `llmwiki.schema.json`, so editors
autocomplete it the same way `page.schema.json` drives page frontmatter.

```yaml
version: 1

bundle:
  root: llmwiki

deps:
  '@funarchy/scenepad': npm
  '@funarchy/koota-pms':
    source: path
    path: ../koota-pms

vendor:
  react-native:
    from: https://reactnative.dev/llms.txt

skills: managed        # managed | vendored | off
mode: copy             # copy | link
```

A dependency value may be the shorthand string `npm` or a table with
`source: npm | path | git`. `git:` is present in the schema and rejected by the
resolver in v1 with a clear "not yet implemented" error.

`vendor:` entries are **declarative provenance only**. `install` never fetches
`from:` — it records where a synthesis came from so a human can re-check it and
so `wiki-vendor` knows what to refresh against. The pages themselves are
written by the `wiki-vendor` skill (§12), which also adds the entry.

For a repository outside the npm ecosystem, `bundle` also carries identity:

```yaml
bundle:
  root: llmwiki
  name: godot-notes
  version: 0.1.0
```

YAML, not TOML: the bundle format is already YAML frontmatter validated by JSON
Schema, so this is one serialization format for the whole project.

### 6.2 `llmwiki-lock.json`

Machine-written, never hand-edited — hence JSON.

```json
{
  "version": 1,
  "bundles": {
    "@funarchy/scenepad": {
      "source": "npm",
      "version": "1.4.2",
      "resolvedFrom": "node_modules/@funarchy/scenepad/wiki",
      "upstreamHash": "sha256-2f1a…",
      "requiredBy": ["."]
    },
    "@funarchy/koota-pms": {
      "source": "npm",
      "version": "0.9.0",
      "resolvedFrom": "node_modules/@funarchy/koota-pms/llmwiki",
      "upstreamHash": "sha256-9c04…",
      "requiredBy": ["@funarchy/scenepad"]
    }
  },
  "skills": {
    "wiki-ingest": "sha256-a13b…",
    "wiki-search": "sha256-77de…",
    "wiki-eval": "sha256-0c92…",
    "wiki-review": "sha256-be41…",
    "wiki-vendor": "sha256-5fa8…"
  }
}
```

`upstreamHash` is taken over the **producer's** bundle content, before any
rewriting (§7.4).

## 7. Resolution and vendoring

### 7.1 Resolution

llmwiki performs no network access. The host package manager fetches; llmwiki
composes.

- **`npm`** — read `node_modules/<pkg>/`, take `package.json` for name and
  version and `llmwiki.yaml` for the bundle root and declared dependencies.
  Works unchanged with npm, pnpm, yarn and bun, and with monorepo
  `workspace:*` links, private registries and git dependencies, because all of
  that is resolved before llmwiki looks.
- **`path`** — a local directory, for monorepo bundles not installed as
  packages. Identity comes from the target's `package.json` if present, else
  from its `llmwiki.yaml` `bundle` block.
- **`git`** — specified, not implemented in v1.

A resolved package with no `llmwiki.yaml`, or one whose declared bundle root
does not exist, is not a bundle. `add` fails with a message naming the package
and pointing at the `wiki-vendor` skill, which is the supported path for a
dependency that ships no knowledge base of its own.

The consequence that matters: **the knowledge you read is the knowledge of the
code version you installed.** No separate version to keep aligned.

### 7.2 Vendoring: copy, git-tracked

`llmwiki install` copies each resolved bundle into
`<root>/deps/<name>/` and the copy is committed to the consumer's repository.

Copied: the producer's pages and index files.
**Excluded: `_meta/`, `deps/`, `vendor/`.** A producer's `_meta/eval/` is its
own test suite and the consumer cannot act on it; a producer's own vendored
subtrees are re-derived by hoisting (§7.3) rather than copied through.

Why committed rather than symlinked into `node_modules`:

- Complete on clone, before `npm install` runs.
- Renders on GitHub, so a human browsing the repository sees the content.
- No symlink portability problem on Windows.
- **The repository records exactly what the agent knew when a given pull
  request was written.**
- **A dependency's knowledge changing arrives as a reviewable diff.** When
  scenepad's ownership rules change, the consumer sees it in a pull request
  instead of silently.

Markdown is small — futuramath's 210 pages are roughly 400 KB — so ten
dependencies is a few megabytes.

`mode: link` is available for repositories that will not vendor, and falls back
to `copy` on Windows. It carries two honest limitations, because a symlinked
upstream tree cannot be modified: cross-bundle link rewriting (§7.4) is
impossible, so link mode is rejected when any dependency declares dependencies
of its own; and lint check 9 is skipped, since there is no copy to verify.
`copy` is the supported path and `link` is an escape hatch.

### 7.3 Transitive dependencies: hoist flat

A published bundle contains **its own pages only** and declares its
dependencies. It never ships its own `deps/` subtree, because nesting vendored
copies would duplicate content arbitrarily deep.

The consumer hoists every transitive bundle flat into `<root>/deps/<name>/`,
npm-style. Flat means dependency-to-dependency links resolve as a sibling path
and identical bundles deduplicate for free.

### 7.4 Cross-bundle link rewriting

Hoisting breaks cross-bundle links, and this is the one genuinely hard
mechanic in the design.

scenepad's page `wiki/pms/runtime.md` (scenepad's root is `wiki/`) contains:

```markdown
[koota traits]: ../deps/@funarchy/koota-pms/traits.md
```

Vendored into a consumer whose root is `llmwiki/`, that page lands at
`llmwiki/deps/@funarchy/scenepad/pms/runtime.md`, and koota-pms is hoisted to
`llmwiki/deps/@funarchy/koota-pms/`. The definition must become:

```markdown
[koota traits]: ../../../@funarchy/koota-pms/traits.md
```

**The rewrite rule.** For each reference definition in a vendored page, resolve
it against the producer's tree:

- Resolves **inside the producer's own pages** → unchanged. Relative paths
  within a bundle survive copying untouched.
- Resolves inside the producer's **`deps/` or `vendor/`** → retarget to the
  consumer's corresponding root, recomputing the relative path from the
  vendored page's new location.
- Resolves **outside the producer's bundle root entirely** (for example
  `../../src/foo.ts`) → cannot resolve in the consumer. Left as written and
  reported as a warning at vendor time. Such a reference should have been a
  `sources:` entry, not a body link.

Because reference definitions are one per line in page footers, this is a
line-level transform. Nothing parses a markdown AST.

Alternatives rejected: a custom `okf:` link scheme (breaks GitHub rendering and
link validation, which is the constraint that makes the format work at all);
symlink shims inside vendored bundles (reintroduces the portability problem);
forbidding cross-bundle links in publishable bundles (simplest, but scenepad
genuinely depends on koota-pms knowledge and losing that link is a real loss).

**Consequence: vendored bytes are not identical to upstream bytes.** So
`upstreamHash` covers the producer's content and the rewrite is deterministic
and reproducible from it. Lint check 9 re-derives the rewrite rather than
comparing vendored bytes to a stored hash of the result.

### 7.5 Vendored `sources:` are not locally verifiable

A vendored scenepad page citing `src/pms/runtime.ts` means *scenepad's*
repository root. Lint skips source-path checks under `deps/**` and `vendor/**`,
and the generated `deps/index.md` states the convention.

These are deliberately **not** rewritten. Rewriting would make them look
verifiable in the consumer when they are not.

### 7.6 Generated index files

`llmwiki install` generates `<root>/deps/index.md` and, when a `vendor/` tree
exists, `<root>/vendor/index.md`. Each does three jobs at once: it satisfies
the orphan check, it records provenance for humans and agents, and it is the
agent's entry point into that subtree.

```markdown
# Dependency knowledge

Bundles authored upstream and vendored into this repository. Read-only —
content here is fixed by `llmwiki install` and verified by `llmwiki lint`. To
change a page, change it in the producing repository. `sources:` paths are
relative to the producing package's own repository root, not this one.

* [@funarchy/scenepad](@funarchy/scenepad/index.md) - PMS scene stack: traits, channels, systems, presentations (v1.4.2, npm)
* [@funarchy/koota-pms](@funarchy/koota-pms/index.md) - ECS runtime under PMS (v0.9.0, npm, required by @funarchy/scenepad)
```

## 8. Version conflict is a hard failure

When two dependencies require different versions of the same bundle, a package
manager nests them. **llmwiki refuses.**

An agent that can navigate to two contradictory pages has no basis to prefer
either, and will silently pick one. Code tolerates two truths in separate
scopes; knowledge does not.

`llmwiki install` exits non-zero and names both requirers. Where the package
manager has already installed the same package at two tree depths, llmwiki
takes the top-level one and warns loudly.

Dependency cycles are likewise rejected: nothing else prevents two bundles
declaring each other.

## 9. Extraction is a graph cut

`llmwiki extract <path…> --to <repo>` moves pages out of a consumer into a
dependency's repository. This is the day-one operation on an existing wiki —
getting futuramath's `wiki/stack/pms` into the scenepad repository — and it is
the only way an existing bundle gets decomposed.

Moving pages cuts the link graph, and the two directions across the cut are not
symmetric:

- **stayed → moved** is fine. Those links become `deps/<name>/…` links once the
  dependency is added, and the CLI rewrites them.
- **moved → stayed** is **illegal**. It would make the dependency's bundle
  depend on its consumer's, which is a cycle.

So `extract --dry-run` prints the cut analysis first: which pages move, which
links cross in each direction, and specifically which are illegal. The real run
performs the move, rewrites the legal direction, and leaves each illegal
cross-link flagged for a human — usually resolved by moving another page too,
or by demoting the reference to prose.

The target repository must already have a bundle root; if it has no
`llmwiki.yaml`, `extract` stops and tells you to run `llmwiki init` there first.

`extract` never commits. Both repositories are left dirty for review.

## 10. CLI surface

```
llmwiki init                         scaffold bundle + config + skills + lint script
llmwiki add <pkg> [--path <dir>]     resolve, vendor, hoist transitives, relock
llmwiki rm <pkg>
llmwiki install [--frozen]           idempotent reconcile from llmwiki.yaml + lock
llmwiki update [pkg]                 re-resolve, report the knowledge diff
llmwiki lint [--fix]                 the mechanical layer (§11)
llmwiki gaps                         eval cases to_resolve + pages containing **Stub.**
llmwiki extract <path…> --to <repo> [--dry-run]
llmwiki skills sync                  reinstall skills from the installed CLI version
```

`install` is the command for `postinstall` and CI. `--frozen` fails instead of
relocking — the `npm ci` equivalent.

**`init`** writes `<root>/index.md`, `<root>/_meta/page.schema.json` and
`<root>/_meta/eval/index.md`; writes `llmwiki.yaml`; adds the root and
`llmwiki.yaml` to `package.json#files`; adds an `llmwiki:lint` script; and installs
the skills. It prompts for exactly two things: the bundle root (offering to
adopt or rename an existing `wiki/` or `docs/wiki/`), and whether to install a
pre-commit lint hook.

The hook default is a real git `pre-commit` hook, with a Claude Code
`PreToolUse` hook on `git commit` offered as an addition rather than a
substitute — futuramath uses the latter alone, which is effective but only
protects one agent.

If `init` finds a `docs/` directory it says so and stops. Migrating is the
ingest skill's job.

`--fix` regenerates only what is generated: the `deps/` and `vendor/` index
files.

## 11. Lint checks

Six checks carry over from the futuramath implementation, two are lifted out of
the review skill because they need no judgment, and four are new for
composition.

| # | Check | Origin |
| --- | --- | --- |
| 1 | Filenames are `kebab-case.md` | existing |
| 2 | Required frontmatter present, `type` valid, `sources` non-empty | existing |
| 3 | `index.md` has no frontmatter, except `okf_version` at the bundle root | existing |
| 4 | Every relative link resolves | existing |
| 5 | No orphan pages — every page reachable from an `index.md` | existing |
| 6 | Every directory has an `index.md` | existing |
| 7 | Body links are reference-style — no inline `[text](url)` | from review skill |
| 8 | No leading-slash paths; no GitHub URLs for in-repo code | from review skill |
| 9 | Vendored bundles match the lock: hash the producer's content, re-derive the rewrite, compare | new |
| 10 | Generated `deps/index.md` and `vendor/index.md` are current | new |
| 11 | Root `index.md` links `deps/` and `vendor/` when they exist | new |
| 12 | Installed skills match the CLI's version — **warning, not error** | new |

External URL liveness is **not** part of `lint` and llmwiki does not ship it:
it is slow, network-dependent, and would make a pre-commit hook unusable.
Checking that `sources:` URLs are still alive belongs in CI with a dedicated
cached tool such as lychee, which futuramath already does as an advisory job.

Checks 9–11 are what make the composition layer honest; without 9, `deps/` is
just a folder anyone can quietly edit.

## 12. The skillset

Five skills, shipped as `SKILL.md` files with trigger descriptions so they are
model-invoked, with thin slash-command aliases for explicit invocation. The
futuramath implementation used slash commands only and compensated with a
`CLAUDE.md` instruction to always start at the wiki; auto-triggering skills are
what actually make the agent reach for the wiki unprompted.

| Skill | Job | Dependency-aware behaviour |
| --- | --- | --- |
| `wiki-ingest` | The write path: synthesize a source into pages, wire indexes, cross-link | **Refuses to write into `deps/**`.** When knowledge belongs to a dependency it says so and points at the producing repository. Also owns extraction judgment (§9) — deciding what belongs upstream and driving `llmwiki extract` |
| `wiki-search` | The read path: navigate from the root index, answer, cite pages, surface gaps | Crosses into `deps/` and `vendor/`, and **reports which subtree an answer came from**, so "synthesized from their docs" never reads as "upstream said so" |
| `wiki-eval` | Usability tests: `add`, single run, batch, `list` | A case failing in dependency territory is an **upstream gap**, reported as such rather than patched locally |
| `wiki-review` | Adversarial: data loss against source, inter-page conflicts, convention judgment, cross-reference saturation | Never reviews `deps/**` — not ours. Does review `vendor/**` — ours |
| `wiki-vendor` | Synthesize a bundle for a third party into `<root>/vendor/<pkg>/` | Sources in priority order: upstream `llms.txt`, the package's own `docs/`, its README, its published documentation site. Marks pages `generated:` per OKF §5.2, sets `sources:` to upstream URLs, and states coverage honestly |

The write path is what the whole discipline rests on, so `wiki-ingest` keeps
the futuramath procedure that earns its length: split aggressively so each page
answers exactly one question, propose the file structure and wait for approval
before writing anything, verify no material claim was dropped, wire up indexes
and bidirectional cross-links, refresh the entry-point files, then lint and
commit once.

`wiki-review` is judgment only. Its mechanical link-format table moves to lint
checks 7 and 8. What remains needs a model: whether a page's opening paragraph
answers the question, whether every sentence earns its place, whether two pages
assert contradictory things a reader would act on differently, and whether a
codebase-specific concept is mentioned without a link. Findings quote lines on
both sides, carry a confidence, and default to "no issue" — the framing is what
stops plausible-but-wrong findings.

Dropped from the futuramath set: `wiki-query`, a duplicate of `wiki-search`
with permission-asking bolted on, and `wiki-gaps`, which is a grep and becomes
`llmwiki gaps`.

The governing rule: **if the answer is computable it is a CLI command; if it
needs judgment it is a skill.** A skill costs tokens on every invocation, and a
skill that exercises no judgment spends them for nothing.

### 12.1 When upstream publishes a real bundle

`llmwiki add <pkg>` finding a genuine upstream bundle for something already
present under `vendor/<pkg>/` does not silently shadow it. It reports the
collision and offers to retire the local synthesis — the graceful path from "we
guessed" to "they told us."

## 13. Skill installation

Canonical copies live in the llmwiki repository at `skills/wiki-*/SKILL.md`.
The CLI copies them into the consumer's `.claude/skills/` and `.agents/skills/`
— the latter is the agent-agnostic convention — and records hashes in the lock.
The repository also ships `.claude-plugin/marketplace.json` for people who
prefer `/plugin install`: one source, two delivery paths.

Hash-locking would otherwise punish customization, so `llmwiki.yaml` takes
`skills: managed | vendored | off`. `managed` keeps them synced and warns on
drift; `vendored` installs once and permits free editing; `off` means the
plugin is in use. Lint check 12 is a warning rather than an error for the same
reason.

## 14. Implementation shape

Twelve lint checks, a link rewriter and a graph resolver are all testable only
if none of them touches the disk. Parse once into a bundle model, then every
interesting operation is a pure function over it:

```
Bundle { name, version, root, pages: Page[], indexes, declaredDeps }
Page   { path, frontmatter, body, links }
```

Four seams carry the design:

- **`md/links.ts`** — the only module that knows link syntax. Lint checks 7–8
  and the vendor rewriter both consume it, so "what is a link" has exactly one
  owner. Given §3.3, this is the highest-leverage file in the codebase.
- **`resolve/graph.ts`** — `(declaredDeps, resolverResults) → flatBundleList |
  ConflictError | CycleError`. No filesystem, no network, so §8 is a unit test.
- **`vendor/rewrite.ts`** — `(content, fromBundle, targetRoot, bundleMap) →
  content`. Deterministic by contract, because lint check 9 re-derives it.
- **`lint/checks/*.ts`** — each check is `(tree) => Issue[]`. Twelve small
  files rather than one script, so adding a check cannot break an existing one.

```
src/
  cli.ts                  dispatch
  config.ts               llmwiki.yaml load + schema validation
  lock.ts                 llmwiki-lock.json
  md/                     frontmatter.ts  links.ts
  resolve/                npm.ts  path.ts  graph.ts
  vendor/                 copy.ts  rewrite.ts  hash.ts
  generate/               deps and vendor index generation
  lint/                   checks/*.ts  run.ts
  commands/               init add rm install update lint gaps extract skills
schemas/                  llmwiki.schema.json  page.schema.json
skills/                   wiki-{ingest,search,eval,review,vendor}/SKILL.md
templates/                index.md  CLAUDE.md pointer
llmwiki/                  llmwiki's own bundle — dogfood, demo, and search fixture
test/
```

The skills are written fresh from this specification. The Funexpected
implementation is input, not source material: `products/01-llm-wiki.md` records
that open-sourcing it is pending agreement with its current maintainers, and
that failing that it is rewritten from scratch. This is that rewrite.

## 15. Testing

Test-driven. The purity above is what makes that cheap rather than ceremonial.

- **Unit** — graph resolution (flat hoist, deduplication, version conflict,
  cycle), link rewriting across all three cases in §7.4, each lint check,
  frontmatter round-tripping. All in memory.
- **Fixtures** — `test/fixtures/` holds small real trees: a consumer, a
  dependency, a dependency with its own dependency, a conflicting pair, a
  cyclic pair, and a producer using a non-default bundle root name.
- **Integration** — run the CLI against a temporary copy of a fixture; assert
  the resulting tree, the lock, and the exit code. This covers `add`,
  `install`, `update` and `extract`.
- **Golden** — snapshot `init` output.
- **Skill/CLI drift** — parse each `SKILL.md` for `llmwiki <cmd>` mentions and
  assert the command exists. Cheap, and it catches the failure mode nobody
  notices until an agent runs a command that was renamed.

Skills themselves cannot be unit-tested, which is what `wiki-eval` is for: the
eval pool is the skillset's test suite, and llmwiki's own bundle gives it
something real to navigate.

## 16. Risks

1. **npm-only in v1.** A Godot or Python consumer can author a bundle and
   consume via `path:`, but cannot depend on a published one. Accepted; `git:`
   is in the config schema and unimplemented.
2. **Vendored update diffs are noisy.** Inherent to git-tracked vendoring —
   the same bargain `go vendor` makes. `update` reports a knowledge-diff
   summary so a pull request description can say what changed semantically. The
   residual risk is reviewers rubber-stamping; there is no technical fix.
3. **A dependency's knowledge quality is unverifiable by the consumer.** You
   vendor whatever was shipped, and `wiki-review` skips `deps/` by design. The
   partial answer is `wiki-eval` treating dependency-territory failures as
   upstream gaps, which lands as a pollution filed against the producing
   repository. Composition makes knowledge quality a governance problem, not a
   tooling one — RPPS is the enforcement mechanism.
4. **`vendor/` quality is bounded by upstream documentation.** The `generated:`
   marking, the separate subtree, and honest coverage reporting are the whole
   defense. A synthesized bundle that quietly reads as authoritative is the main
   way this feature could do harm.
5. **Lint runs on every commit.** Fine at futuramath's 210 pages. A
   synchronous filesystem walk over several thousand pages plus vendored trees
   would need attention. Not a v1 concern; recorded so it is not a surprise.

## 17. Non-goals for v1

A registry or standalone bundle publishing; `git:` resolution; non-markdown
content; a web viewer; anything involving embeddings or vector retrieval;
multi-language bundles.

Deferring the registry costs nothing, because a bundle is a directory plus a
manifest: a `vendor/` bundle can later be promoted to a published
`@llmwiki/react-native` package with no format change. Building it now would
commit to hosting before anyone needs it.

## 18. Decisions, and why

- **OKF-conformant, stricter.** Implementing a published spec is a cheaper
  adoption argument than a bespoke format, and OKF's non-goals define exactly
  the space llmwiki occupies.
- **No new manifest file.** `package.json` plus `llmwiki.yaml` already carry
  identity and dependencies. One version number means knowledge cannot drift
  from code.
- **Resolution piggybacks the package manager.** llmwiki writes no network
  code, and inherits workspaces, private registries and transitive resolution
  for free.
- **Vendored, committed, hash-locked.** Complete on clone, renders on GitHub,
  Windows-safe, and it makes an agent's knowledge auditable per pull request —
  which is the product's core claim.
- **Reference-style relative links only.** The only form that renders on
  GitHub, resolves for an agent, validates without configuration, and reduces
  cross-bundle rewriting to a line-level transform.
- **Flat hoisting, hard failure on conflict.** Flat keeps cross-bundle links
  resolvable and deduplicates for free. Two versions of the same knowledge in
  one tree is worse than a failed install, because an agent will silently pick
  one.
- **`deps/` versus `vendor/`.** Trust encoded in the path needs no metadata
  lookup and cannot be misread.
- **Computable work belongs in the CLI.** A skill that exercises no judgment
  spends tokens for nothing — which is why `wiki-gaps` becomes a command and
  `wiki-review` loses its link-format table.
- **Git is the log.** No `log.md`. One squashed commit per ingest; history is
  queried with `git log`.
- **No `updated:` field.** Git already records when a page changed and cannot
  drift; a hand-set date would.
