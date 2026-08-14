# llmwiki Composition Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the dependency layer — `add` / `rm` / `install` / `update`, npm+path resolution with flat hoisting, copy-vendoring with lock hashes and link rewriting, generated indexes, and lint checks 9–11 — so one repository's bundle can consume another's.

**Architecture:** Resolution and vendoring follow Plan 1's discipline: everything above the filesystem is a pure function. `resolve/graph.ts` turns declared deps into a flat, conflict-checked bundle list; `vendor/rewrite.ts` is a deterministic prefix substitution; `vendor/hash.ts` fingerprints producer content so check 9 can re-derive the whole vendoring and compare. Commands are thin orchestration over one shared `syncDeps`.

**Tech stack:** unchanged from Plan 1 (TypeScript ESM/NodeNext, vitest, `yaml`, `ajv`, `commander`). `yaml`'s `parseDocument` API is used for comment-preserving config edits (probed: works).

**Spec:** `docs/superpowers/specs/2026-08-13-llmwiki-design.md` §4, §6.2, §7, §8, §11 checks 9–11. **Out of scope:** the skillset and check 12 (Plan 3), `git:` resolution, `extract`, registry, publishing.

**Baseline:** branch `feat/composition` off `main` at `dc2a3fa`; 184 tests passing.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/types.ts` | *(modify)* add `ResolvedBundle`, `LockBundle`, `Lock` |
| `src/lock.ts` | read/write/compare `llmwiki-lock.json` |
| `src/vendor/files.ts` | which producer files get vendored (single owner of the exclusion rules) |
| `src/vendor/hash.ts` | deterministic content hash over vendorable producer files |
| `src/vendor/rewrite.ts` | prefix substitution over hrefs, offset-exact, fence-safe |
| `src/vendor/copy.ts` | copy + rewrite a resolved bundle into `<root>/deps/<name>/` |
| `src/resolve/npm.ts` | resolve one npm dep from `node_modules` (top-level, nested fallback) |
| `src/resolve/path.ts` | resolve one `path:` dep |
| `src/resolve/graph.ts` | transitive closure, flat hoist, conflict + cycle detection |
| `src/generate/indexes.ts` | `deps/index.md` and `vendor/index.md` generation |
| `src/commands/install.ts` | `syncDeps` (shared engine) + `install [--frozen]` |
| `src/commands/add.ts`, `src/commands/rm.ts` | config edit via yaml Document + sync |
| `src/commands/update.ts` | sync + lock diff report |
| `src/lint/checks/vendored-lock.ts` | check 9 |
| `src/lint/checks/generated-indexes.ts` | check 10 |
| `src/lint/checks/root-links-deps.ts` | check 11 |
| `src/lint/checks/index.ts` | *(modify)* register 9–11 |
| `src/bundle/load.ts` | *(modify)* exempt `README.md` under `deps/` from concept checks |
| `src/cli.ts` | *(modify)* register `add`/`rm`/`install`/`update` |
| `test/helpers/producer.ts` | fixture builder for producer packages |

## Spec decisions this plan settles

1. **The rewrite covers inline links in index files, not only footer definitions.** §7.4's prose emphasizes reference definitions, but §3.2 makes index links absolute precisely so generated (and copied) indexes are "prefix-swappable during vendoring" — a producer's own `index.md` files are vendored and their inline absolute links must be retargeted or they dangle. Mechanism: match hrefs on the `stripCode`-blanked copy (blanking preserves offsets), edit the original at those exact offsets, right-to-left. Fences stay untouched for free.
2. **Check 9 degrades to a warning when the producer is not resolvable.** "Complete on clone" is a design goal (§7.2): a fresh clone before `npm install` must not lint red merely because `node_modules` is absent. Unresolvable producer → `warning: cannot verify vendored bundle (dependency not installed)`. Everything verifiable stays an error.
3. **Vendoring excludes the producer's bundle-root `README.md`** alongside `_meta/`, `deps/` and `vendor/` (§7.2 lists the last three). The producer's README is its front door, not knowledge — and if copied, the consumer's checks 1–2 would flag it (only the *consumer's* root README is exempt). Same exclusion list feeds the hash, so hash and copy can never disagree.
4. **`README.md` anywhere under `<root>/deps/` is exempt from concept-page checks.** Needed for `mode: link`, where the producer's tree (README included) is reachable through the symlink and cannot be filtered by copying.
5. **Generated index entries are derivable from lock + vendored tree alone**, because check 10 regenerates them at lint time when the producer may be unavailable. Entry format: `* [<name>](/<root>/deps/<name>/index.md) - v<version>, <source>` plus `, required by <names>` when not required directly. (The spec's §7.6 example shows prose descriptions; those would need the producer present, so the format here is deliberately leaner.)
6. **`install` never edits user-authored files.** If the root index lacks a link to `deps/index.md`, install prints a reminder; check 11 enforces. Same for `vendor/`. And `install` never touches `<root>/vendor/` content — that tree is user-authored synthesis; only its `index.md` is generated.
7. **Nested-vs-top npm duplication** (§8): when a transitive dep resolves at consumer top-level *and* nested under its requirer at a different version, take top-level and warn. A genuine version conflict (two requirers demanding different versions with no top-level winner) is a hard `ConflictError` naming both requirers. Cycles are a hard `CycleError` naming the path.

---

## Task 1: Types, lock module

**Files:** modify `src/types.ts`; create `src/lock.ts`; test `test/lock.test.ts`.

Add to `src/types.ts`:

```ts
/** A dependency bundle after resolution, before vendoring. */
export interface ResolvedBundle {
  name: string;
  version: string;
  source: DepSource;
  /** Absolute directory of the producing package (its repo root). */
  absDir: string;
  /** The producer's bundle root, relative to absDir. */
  producerRoot: string;
  /** Deps the producer declares in its own llmwiki.yaml. */
  declaredDeps: Record<string, DepSpec>;
  /** Requirers: '.' is the consumer itself. */
  requiredBy: string[];
}

export interface LockBundle {
  source: DepSource;
  version: string;
  /** Where resolution found it, repo-relative posix for npm, the config path for path deps. */
  resolvedFrom: string;
  /** sha256 over the producer's vendorable content, before rewriting. */
  upstreamHash: string;
  requiredBy: string[];
}

export interface Lock {
  version: 1;
  bundles: Record<string, LockBundle>;
  /** Skill hashes — written by Plan 3; carried as-is here. */
  skills: Record<string, string>;
}
```

`src/lock.ts`:

```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Lock } from './types.js';

export const LOCK_FILENAME = 'llmwiki-lock.json';

export function readLock(repoRoot: string): Lock | null {
  const path = join(repoRoot, LOCK_FILENAME);
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as Lock;
  if (raw.version !== 1) {
    throw new Error(`Unsupported ${LOCK_FILENAME} version: ${String(raw.version)}`);
  }
  return { version: 1, bundles: raw.bundles ?? {}, skills: raw.skills ?? {} };
}

/** Stable serialization: sorted bundle names, sorted skills, 2-space indent. */
export function writeLock(repoRoot: string, lock: Lock): void {
  const sortedEntries = <T>(record: Record<string, T>) =>
    Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
  const stable: Lock = {
    version: 1,
    bundles: sortedEntries(lock.bundles),
    skills: sortedEntries(lock.skills),
  };
  writeFileSync(join(repoRoot, LOCK_FILENAME), `${JSON.stringify(stable, null, 2)}\n`);
}

export function locksEqual(a: Lock | null, b: Lock | null): boolean {
  return JSON.stringify(a && normalize(a)) === JSON.stringify(b && normalize(b));
}

function normalize(lock: Lock): unknown {
  return {
    version: lock.version,
    bundles: Object.entries(lock.bundles)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, e]) => [name, { ...e, requiredBy: [...e.requiredBy].sort() }]),
    skills: Object.entries(lock.skills).sort(([a], [b]) => a.localeCompare(b)),
  };
}
```

Tests (`test/lock.test.ts`, use `makeRepo`): round-trips a lock; `readLock` returns null when absent; throws on version 2; `writeLock` output is byte-identical regardless of insertion order (write two permutations, compare files); `locksEqual` ignores `requiredBy` order but not content. **5 tests.**

Commit: `feat: add lock file module and resolution types`.

---

## Task 2: Vendorable-files walk and content hash

**Files:** create `src/vendor/files.ts`, `src/vendor/hash.ts`; test `test/vendor/hash.test.ts`; create `test/helpers/producer.ts`.

`test/helpers/producer.ts` — the fixture builder every later task uses:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { page } from './fixture.js';

export interface ProducerSpec {
  /** Package name, e.g. '@funarchy/scenepad'. */
  name: string;
  version?: string;
  /** Producer's bundle root name. Default 'llmwiki'. */
  root?: string;
  /** Extra llmwiki.yaml lines, e.g. deps. */
  configExtra?: string;
  /** Files relative to the bundle root. Defaults give a minimal valid bundle. */
  files?: Record<string, string>;
  /** Omit llmwiki.yaml entirely (a package with no bundle). */
  noBundle?: boolean;
}

/** Write a producer package into `dir` (e.g. <repo>/node_modules/<name>). */
export function writeProducer(dir: string, spec: ProducerSpec): void {
  const root = spec.root ?? 'llmwiki';
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify({ name: spec.name, version: spec.version ?? '1.0.0' }, null, 2)}\n`,
  );
  if (spec.noBundle) return;
  writeFileSync(join(dir, 'llmwiki.yaml'), `version: 1\nbundle:\n  root: ${root}\n${spec.configExtra ?? ''}`);
  const files = spec.files ?? {
    'index.md': `# ${spec.name}\n\n* [Topic](/${root}/topic.md) - the one topic\n`,
    'topic.md': page('Topic'),
  };
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}
```

`src/vendor/files.ts` — single owner of "what gets vendored":

```ts
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Top-level producer directories that are never vendored (§7.2 + plan decision 3). */
const EXCLUDED_TOP = new Set(['_meta', 'deps', 'vendor']);

/**
 * Files to vendor from a producer bundle, as posix paths relative to its root,
 * sorted. Excludes the top-level tooling dirs, the producer's bundle-root
 * README.md (its front door, not knowledge), and dot-entries. Includes non-md
 * assets (images exist for humans). Skips unstattable entries (dangling
 * symlinks), matching the loader.
 */
export function vendorableFiles(absBundleRoot: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.')) continue;
      if (rel === '' && (EXCLUDED_TOP.has(entry) || entry === 'README.md')) continue;
      const abs = join(dir, entry);
      let isDir: boolean;
      try {
        isDir = statSync(abs).isDirectory();
      } catch {
        continue;
      }
      const childRel = rel === '' ? entry : `${rel}/${entry}`;
      if (isDir) walk(abs, childRel);
      else out.push(childRel);
    }
  };
  walk(absBundleRoot, '');
  return out.sort();
}
```

`src/vendor/hash.ts`:

```ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vendorableFiles } from './files.js';

/**
 * Deterministic fingerprint of a producer bundle's vendorable content, before
 * any rewriting. Uses the same file list as vendoring, so hash and copy can
 * never disagree about scope. Path and bytes both contribute: a rename with
 * identical content changes the hash.
 */
export function hashBundle(absBundleRoot: string): string {
  const outer = createHash('sha256');
  for (const rel of vendorableFiles(absBundleRoot)) {
    const inner = createHash('sha256').update(readFileSync(join(absBundleRoot, rel))).digest('hex');
    outer.update(`${rel}\0${inner}\n`);
  }
  return `sha256-${outer.digest('hex')}`;
}
```

Tests (`test/vendor/hash.test.ts`): identical trees hash identically across two temp dirs; content change changes hash; rename-with-same-content changes hash; `_meta/`, `deps/`, `vendor/`, root `README.md`, and dotfiles do not affect the hash; a nested (non-root) `README.md` **does**; file list is sorted and excludes the exclusions (direct `vendorableFiles` assertions). **7 tests.**

Commit: `feat: add vendorable-file walk and deterministic bundle hash`.

---

## Task 3: Resolvers (npm, path)

**Files:** create `src/resolve/npm.ts`, `src/resolve/path.ts`; test `test/resolve/resolvers.test.ts`.

Shared shape: both return a `ResolvedBundle` (without `requiredBy`, which the graph owns — return type `Omit<ResolvedBundle, 'requiredBy'>`).

`src/resolve/path.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig, CONFIG_FILENAME } from '../config.js';
import type { DepSpec, ResolvedBundle } from '../types.js';

export type Resolved = Omit<ResolvedBundle, 'requiredBy'>;

/** Resolve a `path:` dep. `baseDir` is the directory the path is relative to. */
export function resolvePathDep(baseDir: string, name: string, spec: DepSpec): Resolved {
  const absDir = resolve(baseDir, spec.path!);
  if (!existsSync(join(absDir, CONFIG_FILENAME))) {
    throw new Error(
      `Dependency "${name}" at ${absDir} ships no knowledge bundle (no ${CONFIG_FILENAME}). ` +
        `The wiki-vendor skill is the supported path for a dependency without one.`,
    );
  }
  const config = loadConfig(absDir);
  const pkgPath = join(absDir, 'package.json');
  const pkg = existsSync(pkgPath)
    ? (JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: string; version?: string })
    : {};
  const version = pkg.version ?? config.bundle.version;
  if (!version) {
    throw new Error(`Dependency "${name}" at ${absDir} declares no version (package.json or bundle.version).`);
  }
  if (!existsSync(join(absDir, config.bundle.root))) {
    throw new Error(`Dependency "${name}": bundle root ${config.bundle.root} not found in ${absDir}.`);
  }
  return {
    name,
    version,
    source: 'path',
    absDir,
    producerRoot: config.bundle.root,
    declaredDeps: config.deps,
  };
}
```

`src/resolve/npm.ts`:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_FILENAME } from '../config.js';
import { resolvePathDep, type Resolved } from './path.js';

export interface NpmResolution {
  resolved: Resolved;
  /** Set when a nested copy was shadowed by the top-level one (§8). */
  warning?: string;
}

/**
 * Resolve an npm dep. Consumer top-level `node_modules` wins; the requirer's
 * nested `node_modules` is the fallback. When both exist at different
 * versions, top-level wins with a loud warning (§8).
 */
export function resolveNpmDep(repoRoot: string, requirerDir: string | null, name: string): NpmResolution {
  const top = join(repoRoot, 'node_modules', ...name.split('/'));
  const nested = requirerDir ? join(requirerDir, 'node_modules', ...name.split('/')) : null;
  const topExists = existsSync(top);
  const nestedExists = nested !== null && existsSync(nested);

  if (!topExists && !nestedExists) {
    throw new Error(`Dependency "${name}" is not installed — run your package manager first.`);
  }
  const dir = topExists ? top : (nested as string);
  if (!existsSync(join(dir, CONFIG_FILENAME))) {
    throw new Error(
      `Dependency "${name}" ships no knowledge bundle (no ${CONFIG_FILENAME}). ` +
        `The wiki-vendor skill is the supported path for a dependency without one.`,
    );
  }
  // Identity + bundle come from the same logic as a path dep at that directory.
  const resolved = { ...resolvePathDep(dir, name, { source: 'path', path: '.' }), source: 'npm' as const };

  let warning: string | undefined;
  if (topExists && nestedExists) {
    const nestedResolved = resolvePathDep(nested as string, name, { source: 'path', path: '.' });
    if (nestedResolved.version !== resolved.version) {
      warning =
        `"${name}" exists at top-level (v${resolved.version}) and nested under the requirer ` +
        `(v${nestedResolved.version}); using top-level.`;
    }
  }
  return { resolved, warning };
}
```

Tests (`test/resolve/resolvers.test.ts`, using `writeProducer` + `makeRepo`): path dep resolves with producer root and declared deps; path dep without `llmwiki.yaml` errors naming wiki-vendor; path dep without any version errors; version falls back to `bundle.version` when no package.json; npm dep resolves from top-level `node_modules`; scoped name (`@scope/name`) resolves; missing package errors with "not installed"; nested fallback used when top-level absent; top-level shadows nested with warning when versions differ; no warning when versions match. **10 tests.**

Commit: `feat: resolve npm and path dependencies to bundles`.

---

## Task 4: The graph — transitive closure, hoist, conflicts, cycles

**Files:** create `src/resolve/graph.ts`; test `test/resolve/graph.test.ts`.

```ts
import { resolveNpmDep } from './npm.js';
import { resolvePathDep, type Resolved } from './path.js';
import type { Config, DepSpec, ResolvedBundle } from '../types.js';

export class ConflictError extends Error {}
export class CycleError extends Error {}

export interface GraphResult {
  /** Flat, deduped, sorted by name. */
  bundles: ResolvedBundle[];
  warnings: string[];
}

interface QueueItem {
  name: string;
  spec: DepSpec;
  /** '.' for the consumer, else the requiring bundle's name. */
  requirer: string;
  /** Directory `path:` specs resolve against; requirer's absDir for transitive deps. */
  baseDir: string;
  /** Requirer's absDir for nested node_modules fallback; null for the consumer. */
  requirerDir: string | null;
}

/**
 * Resolve the full dependency graph, flat (§7.3). Two bundles with the same
 * name must resolve to the same version — knowledge does not tolerate two
 * truths in one tree (§8) — except that a nested npm copy shadowed by
 * top-level is a warning, handled inside resolveNpmDep. Cycles are rejected:
 * nothing else stops two bundles declaring each other.
 */
export function resolveGraph(repoRoot: string, config: Config): GraphResult {
  const byName = new Map<string, ResolvedBundle>();
  const warnings: string[] = [];
  const queue: QueueItem[] = Object.entries(config.deps).map(([name, spec]) => ({
    name,
    spec,
    requirer: '.',
    baseDir: repoRoot,
    requirerDir: null,
  }));

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.spec.source === 'git') {
      throw new Error(`Dependency "${item.name}": git resolution is not implemented in v1.`);
    }

    const existing = byName.get(item.name);
    if (existing) {
      // Already resolved: verify the same version is wanted, merge requirers.
      const again = resolveOne(repoRoot, item);
      if (again.resolved.version !== existing.version) {
        throw new ConflictError(
          `Version conflict for "${item.name}": v${existing.version} (required by ${existing.requiredBy.join(', ')}) ` +
            `vs v${again.resolved.version} (required by ${item.requirer}). ` +
            `Two versions of the same knowledge cannot coexist in one tree — align the requirers.`,
        );
      }
      if (!existing.requiredBy.includes(item.requirer)) existing.requiredBy.push(item.requirer);
      continue;
    }

    const { resolved, warning } = resolveOne(repoRoot, item);
    if (warning) warnings.push(warning);
    byName.set(item.name, { ...resolved, requiredBy: [item.requirer] });
    for (const [depName, depSpec] of Object.entries(resolved.declaredDeps)) {
      queue.push({
        name: depName,
        spec: depSpec,
        requirer: item.name,
        baseDir: resolved.absDir,
        requirerDir: resolved.absDir,
      });
    }
  }

  detectCycles(config, byName);
  return { bundles: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)), warnings };
}

function resolveOne(repoRoot: string, item: QueueItem): { resolved: Resolved; warning?: string } {
  if (item.spec.source === 'path') {
    return { resolved: resolvePathDep(item.baseDir, item.name, item.spec) };
  }
  return resolveNpmDep(repoRoot, item.requirerDir, item.name);
}

/** DFS over name → declared-dep-name edges, '.' included as the root. */
function detectCycles(config: Config, byName: Map<string, ResolvedBundle>): void {
  const edges = new Map<string, string[]>([['.', Object.keys(config.deps)]]);
  for (const [name, bundle] of byName) edges.set(name, Object.keys(bundle.declaredDeps));

  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (node: string, path: string[]) => {
    if (done.has(node)) return;
    if (visiting.has(node)) {
      const cycle = [...path.slice(path.indexOf(node)), node].join(' → ');
      throw new CycleError(`Dependency cycle: ${cycle}. A bundle cannot require its own consumer.`);
    }
    visiting.add(node);
    for (const next of edges.get(node) ?? []) visit(next, [...path, node]);
    visiting.delete(node);
    done.add(node);
  };
  visit('.', []);
}
```

Tests (`test/resolve/graph.test.ts`): single npm dep resolves; a dep-with-a-dep hoists flat (both in result, transitive `requiredBy` names its requirer); a diamond (two deps sharing one transitive at the same version) dedupes and merges `requiredBy`; a genuine version conflict throws `ConflictError` naming both requirers; a two-bundle cycle throws `CycleError` naming the path; `git:` spec throws not-implemented; transitive `path:` dep resolves relative to the *declaring producer's* directory, not the consumer; result sorted by name; nested-shadow warning propagates into `warnings`. **9 tests.** Build fixtures with `writeProducer` into `node_modules/` of a `makeRepo` root (transitive nested: write into `node_modules/<a>/node_modules/<b>`).

Commit: `feat: resolve the dependency graph with flat hoisting`.

---

## Task 5: The rewriter

**Files:** create `src/vendor/rewrite.ts`; test `test/vendor/rewrite.test.ts`.

```ts
import { stripCode } from '../md/links.js';

export interface RewriteOptions {
  /** The producer's bundle root name, e.g. 'wiki'. */
  producerRoot: string;
  /** The consumer's bundle root name, e.g. 'llmwiki'. */
  consumerRoot: string;
  /** The bundle's name in the consumer's deps/, e.g. '@funarchy/scenepad'. */
  bundleName: string;
}

export interface RewriteResult {
  content: string;
  warnings: string[];
}

const REF_DEF_RE = /^ {0,3}\[[^\]]+\]:\s*(\S+)/;
const INLINE_LINK_RE = /\[[^\]]*\]\(\s*([^)\s]+)/g;

/**
 * Retarget every absolute href in a vendored page (§7.4). A prefix
 * substitution, identical for every page at any depth — and a no-op when
 * producer and consumer roots match and the page has no cross-bundle links.
 *
 * Matching happens on the stripCode-blanked copy, whose blanking preserves
 * offsets, and edits are applied to the original at those exact offsets —
 * so hrefs inside code fences are never touched. Covers reference
 * definitions AND inline links: producers' index files use inline absolute
 * links by design (§3.2) and are vendored too.
 */
export function rewritePage(content: string, opts: RewriteOptions): RewriteResult {
  const warnings: string[] = [];
  const normalized = content.replace(/\r\n/g, '\n');
  const originalLines = normalized.split('\n');
  const strippedLines = stripCode(normalized).split('\n');

  const mapHref = (href: string): string | null => {
    const [path, frag] = splitFragment(href);
    if (!path.startsWith('/')) return null;
    const producerPrefix = `/${opts.producerRoot}`;
    if (path === producerPrefix || path.startsWith(`${producerPrefix}/`)) {
      const rest = path.slice(producerPrefix.length); // '' or '/…'
      if (rest.startsWith('/vendor/')) {
        warnings.push(`link into the producer's vendor/ is not vendored and will dangle: ${href}`);
        return null;
      }
      const mapped = rest.startsWith('/deps/')
        ? `/${opts.consumerRoot}/deps${rest.slice('/deps'.length)}` // flat hoist
        : `/${opts.consumerRoot}/deps/${opts.bundleName}${rest}`; // producer's own page
      return mapped + frag;
    }
    warnings.push(`link outside the producer's bundle root cannot be resolved by the consumer: ${href}`);
    return null;
  };

  const rewritten = originalLines.map((line, i) => {
    const stripped = strippedLines[i];
    const edits: Array<{ start: number; end: number; text: string }> = [];

    const refMatch = REF_DEF_RE.exec(stripped);
    if (refMatch) {
      const href = refMatch[1];
      const start = refMatch[0].length - href.length + refMatch.index;
      collect(edits, href, start);
    } else {
      INLINE_LINK_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = INLINE_LINK_RE.exec(stripped)) !== null) {
        const href = m[1];
        collect(edits, href, m.index + m[0].length - href.length);
      }
    }

    let result = line;
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    }
    return result;

    function collect(list: typeof edits, href: string, start: number) {
      const mapped = mapHref(href);
      if (mapped !== null && mapped !== href) list.push({ start, end: start + href.length, text: mapped });
    }
  });

  return { content: rewritten.join('\n'), warnings };
}

function splitFragment(href: string): [string, string] {
  const i = href.indexOf('#');
  return i === -1 ? [href, ''] : [href.slice(0, i), href.slice(i)];
}
```

Tests (`test/vendor/rewrite.test.ts`) — the §7.4 table plus the properties that justified absolute links:

- producer's own page: `[a]: /wiki/pms/traits.md` → `/llmwiki/deps/@x/scenepad/pms/traits.md`
- cross-bundle: `[k]: /wiki/deps/@x/koota/traits.md` → `/llmwiki/deps/@x/koota/traits.md` (flat, not nested)
- producer vendor/: unchanged + warning
- outside producer root (`/src/foo.ts`): unchanged + warning
- fragment preserved: `/wiki/a.md#s` → `/llmwiki/deps/@x/scenepad/a.md#s`
- inline link in an index body rewritten
- href inside a code fence untouched
- relative href untouched, no warning
- external URL untouched, no warning
- matching roots (`producerRoot === consumerRoot === 'llmwiki'`): own-page hrefs still gain the `deps/<name>` segment (this is **not** the no-op case — the no-op in §7.4 is the cross-bundle case)
- **depth-independence property test**: the same footer rewritten identically when the page content is embedded at different notional depths (same input lines → same output lines regardless of surrounding content)
- CRLF input normalized, still rewritten

**12 tests.**

Commit: `feat: add the vendoring link rewriter`.

---

## Task 6: Vendoring copy

**Files:** create `src/vendor/copy.ts`; test `test/vendor/copy.test.ts`.

```ts
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { vendorableFiles } from './files.js';
import { rewritePage } from './rewrite.js';
import type { ResolvedBundle } from '../types.js';

/** Remove the whole generated deps tree; install rebuilds it from resolution. */
export function clearDeps(repoRoot: string, consumerRoot: string): void {
  rmSync(join(repoRoot, consumerRoot, 'deps'), { recursive: true, force: true });
}

/** Copy one resolved bundle into `<consumerRoot>/deps/<name>/`, rewriting links. */
export function vendorBundle(repoRoot: string, consumerRoot: string, bundle: ResolvedBundle): string[] {
  const warnings: string[] = [];
  const srcRoot = join(bundle.absDir, bundle.producerRoot);
  const destRoot = join(repoRoot, consumerRoot, 'deps', ...bundle.name.split('/'));

  for (const rel of vendorableFiles(srcRoot)) {
    const src = join(srcRoot, rel);
    const dest = join(destRoot, rel);
    mkdirSync(dirname(dest), { recursive: true });
    if (rel.endsWith('.md')) {
      const result = rewritePage(readFileSync(src, 'utf-8'), {
        producerRoot: bundle.producerRoot,
        consumerRoot,
        bundleName: bundle.name,
      });
      warnings.push(...result.warnings.map((w) => `${bundle.name}/${rel}: ${w}`));
      writeFileSync(dest, result.content);
    } else {
      copyFileSync(src, dest);
    }
  }
  return warnings;
}
```

Tests: vendors a producer with a non-default root into `deps/<scoped name>/` with rewritten links; asset file copied byte-identical; `_meta`/root README not present in the output; warnings prefixed with `name/relpath`; `clearDeps` removes everything and is safe when absent; vendoring is **reproducible** — vendor twice into two repos, trees identical. **6 tests.**

Commit: `feat: vendor bundles by copy with link rewriting`.

---

## Task 7: Generated indexes

**Files:** create `src/generate/indexes.ts`; test `test/generate/indexes.test.ts`.

```ts
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config, Lock } from '../types.js';

/** Deterministic body of `<root>/deps/index.md`, derived from lock alone (plan decision 5). */
export function depsIndexContent(consumerRoot: string, lock: Lock): string {
  const lines = [
    '# Dependency knowledge',
    '',
    'Bundles authored upstream and vendored into this repository. Read-only —',
    'content here is written by `llmwiki install` and verified by `llmwiki lint`.',
    'To change a page, change it in the producing repository. `sources:` paths',
    "are relative to the producing package's own repository, not this one.",
    '',
  ];
  for (const [name, entry] of Object.entries(lock.bundles).sort(([a], [b]) => a.localeCompare(b))) {
    const via = entry.requiredBy.includes('.') ? '' : `, required by ${entry.requiredBy.join(', ')}`;
    lines.push(`* [${name}](/${consumerRoot}/deps/${name}/index.md) - v${entry.version}, ${entry.source}${via}`);
  }
  lines.push('');
  return lines.join('\n');
}

/** Deterministic body of `<root>/vendor/index.md`, from config + existing dirs. */
export function vendorIndexContent(consumerRoot: string, config: Config, vendorDirs: string[]): string {
  const lines = [
    '# Synthesized third-party knowledge',
    '',
    'Bundles written *in this repository* from upstream documentation — the',
    'upstream did not author these pages. Weigh them accordingly.',
    '',
  ];
  for (const name of [...vendorDirs].sort()) {
    const from = config.vendor[name]?.from;
    lines.push(`* [${name}](/${consumerRoot}/vendor/${name}/index.md) - ${from ? `from ${from}` : 'provenance undeclared'}`);
  }
  lines.push('');
  return lines.join('\n');
}

/** Subdirectories of `<root>/vendor/`, or [] when absent. */
export function vendorDirsOf(repoRoot: string, consumerRoot: string): string[] {
  const dir = join(repoRoot, consumerRoot, 'vendor');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

/** Write both generated indexes where applicable. Never touches vendor content. */
export function generateIndexes(repoRoot: string, consumerRoot: string, config: Config, lock: Lock): void {
  if (Object.keys(lock.bundles).length > 0) {
    writeFileSync(join(repoRoot, consumerRoot, 'deps', 'index.md'), depsIndexContent(consumerRoot, lock));
  }
  const vendorDirs = vendorDirsOf(repoRoot, consumerRoot);
  if (vendorDirs.length > 0) {
    writeFileSync(join(repoRoot, consumerRoot, 'vendor', 'index.md'), vendorIndexContent(consumerRoot, config, vendorDirs));
  }
}
```

Note: a scoped name contains `/`, so the entry link `/root/deps/@scope/name/index.md` is naturally correct.

Tests: deps index lists bundles sorted with version/source; transitive entry shows `required by`; direct entry does not; content derivable from lock alone (no producer on disk); vendor index lists dirs with `from:` provenance and flags undeclared; `generateIndexes` writes nothing when there are no deps and no vendor dirs. **6 tests.**

Commit: `feat: generate deps and vendor indexes`.

---

## Task 8: `syncDeps` and the `install` command

**Files:** create `src/commands/install.ts`; modify `src/cli.ts`; test `test/commands/install.test.ts`.

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot, loadConfig } from '../config.js';
import { readLock, writeLock, locksEqual, LOCK_FILENAME } from '../lock.js';
import { resolveGraph } from '../resolve/graph.js';
import { hashBundle } from '../vendor/hash.js';
import { clearDeps, vendorBundle } from '../vendor/copy.js';
import { generateIndexes } from '../generate/indexes.js';
import { relative, sep } from 'node:path';
import type { Config, Lock, ResolvedBundle } from '../types.js';

export interface SyncResult {
  lock: Lock;
  bundles: ResolvedBundle[];
  warnings: string[];
}

function resolvedFromOf(repoRoot: string, bundle: ResolvedBundle, config: Config): string {
  const spec = config.deps[bundle.name];
  if (spec?.source === 'path') return spec.path!;
  const rel = relative(repoRoot, bundle.absDir).split(sep).join('/');
  return rel === '' ? '.' : rel;
}

/**
 * The one engine behind install/add/rm/update: resolve, hash, vendor, generate,
 * lock. `frozen` verifies instead of writing: the computed lock must equal the
 * existing one, the `npm ci` contract.
 */
export function syncDeps(repoRoot: string, config: Config, options: { frozen: boolean }): SyncResult {
  const { bundles, warnings } = resolveGraph(repoRoot, config);
  const previous = readLock(repoRoot);

  const lock: Lock = { version: 1, bundles: {}, skills: previous?.skills ?? {} };
  for (const bundle of bundles) {
    lock.bundles[bundle.name] = {
      source: bundle.source,
      version: bundle.version,
      resolvedFrom: resolvedFromOf(repoRoot, bundle, config),
      upstreamHash: hashBundle(join(bundle.absDir, bundle.producerRoot)),
      requiredBy: [...bundle.requiredBy].sort(),
    };
  }

  if (options.frozen && !locksEqual(previous, lock)) {
    throw new Error(`${LOCK_FILENAME} is out of date — run \`llmwiki install\` without --frozen and commit the result.`);
  }

  clearDeps(repoRoot, config.bundle.root);
  for (const bundle of bundles) {
    warnings.push(...vendorBundle(repoRoot, config.bundle.root, bundle));
  }
  generateIndexes(repoRoot, config.bundle.root, config, lock);
  if (!options.frozen) writeLock(repoRoot, lock);

  return { lock, bundles, warnings };
}

/** Print a reminder when a generated tree exists but the root index does not route to it. */
export function rootIndexHints(repoRoot: string, config: Config, lock: Lock): string[] {
  const hints: string[] = [];
  const rootIndex = join(repoRoot, config.bundle.root, 'index.md');
  if (!existsSync(rootIndex)) return hints;
  const body = readFileSync(rootIndex, 'utf-8');
  const root = config.bundle.root;
  if (Object.keys(lock.bundles).length > 0 && !body.includes(`/${root}/deps/index.md`)) {
    hints.push(`Add a link to /${root}/deps/index.md from your root index so agents can reach dependency knowledge.`);
  }
  if (existsSync(join(repoRoot, root, 'vendor', 'index.md')) && !body.includes(`/${root}/vendor/index.md`)) {
    hints.push(`Add a link to /${root}/vendor/index.md from your root index.`);
  }
  return hints;
}

export function installCommand(cwd: string, options: { frozen: boolean }): number {
  const repoRoot = findRepoRoot(cwd);
  if (!repoRoot) {
    throw new Error('No llmwiki.yaml found in this directory or any parent — run `llmwiki init` first.');
  }
  const config = loadConfig(repoRoot);
  const { lock, bundles, warnings } = syncDeps(repoRoot, config, options);

  const count = bundles.length;
  console.log(`Vendored ${count} bundle${count === 1 ? '' : 's'} into ${config.bundle.root}/deps/.`);
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const hint of rootIndexHints(repoRoot, config, lock)) console.log(hint);
  return 0;
}
```

CLI registration (in `src/cli.ts`, following the existing pattern):

```ts
program
  .command('install')
  .description('resolve, vendor and lock this bundle\'s dependencies')
  .option('--frozen', 'fail instead of updating the lock (CI mode)', false)
  .action(async (opts: { frozen: boolean }) => {
    await runAction(() => installCommand(process.cwd(), { frozen: opts.frozen }));
  });
```

Tests (`test/commands/install.test.ts`): full happy path — consumer with one npm dep gets `deps/<name>/` with rewritten pages, `deps/index.md`, and a lock whose hash matches `hashBundle` of the producer; transitive dep hoisted flat and locked with correct `requiredBy`; re-running `syncDeps` is idempotent (identical tree + lock bytes); a stale vendored file is healed (hand-edit a vendored page, re-sync, content restored); `--frozen` with a matching lock succeeds and does not rewrite the lock file (mtime/bytes unchanged); `--frozen` with no lock or a stale lock throws naming the file; deps removed from config disappear from `deps/` after sync; `install` result passes `runLint` **end to end on a consumer whose root index links deps** (register checks 1–8; the full-lint assertion is the loop-closer); `rootIndexHints` fires when the root index lacks the link and stays quiet when present; `syncDeps` with zero deps leaves no `deps/` dir and an empty-bundle lock. **10 tests.**

Commit: `feat: add llmwiki install with the shared sync engine`.

---

## Task 9: `add` and `rm`

**Files:** create `src/commands/add.ts`, `src/commands/rm.ts`; modify `src/cli.ts`; test `test/commands/add-rm.test.ts`.

Both edit `llmwiki.yaml` with `yaml`'s `parseDocument` (comment-preserving — probed). Shape:

```ts
// add.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { findRepoRoot, loadConfig, CONFIG_FILENAME } from '../config.js';
import { resolveGraph } from '../resolve/graph.js';
import { syncDeps, rootIndexHints } from './install.js';

export function addCommand(cwd: string, pkg: string, options: { path?: string }): number {
  const repoRoot = findRepoRoot(cwd);
  if (!repoRoot) throw new Error('No llmwiki.yaml found — run `llmwiki init` first.');

  const config = loadConfig(repoRoot);
  if (config.deps[pkg]) throw new Error(`"${pkg}" is already a dependency.`);

  // Validate resolvability BEFORE touching the config: a failed add must leave
  // no trace. Probe with a config copy that includes the new dep.
  const probe = {
    ...config,
    deps: { ...config.deps, [pkg]: options.path ? { source: 'path' as const, path: options.path } : { source: 'npm' as const } },
  };
  resolveGraph(repoRoot, probe);

  const configPath = join(repoRoot, CONFIG_FILENAME);
  const doc = parseDocument(readFileSync(configPath, 'utf-8'));
  doc.setIn(['deps', pkg], options.path ? { source: 'path', path: options.path } : 'npm');
  writeFileSync(configPath, String(doc));

  const updated = loadConfig(repoRoot);
  const { lock, bundles, warnings } = syncDeps(repoRoot, updated, { frozen: false });
  console.log(`Added "${pkg}". Vendored ${bundles.length} bundle${bundles.length === 1 ? '' : 's'}.`);
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const hint of rootIndexHints(repoRoot, updated, lock)) console.log(hint);
  return 0;
}
```

`rm.ts` mirrors it: error when the dep is not declared; `doc.deleteIn(['deps', pkg])`; re-sync (which reconciles `deps/` — a bundle still required transitively by another dep stays, which the test pins down).

CLI: `add <pkg>` with `--path <dir>`, `rm <pkg>`.

Tests: add an npm dep — config gains the entry (comment above `deps:` preserved), tree vendored, lock written; add `--path`; add of an unresolvable package **leaves the config byte-identical**; add of a duplicate errors; rm removes entry + tree + lock entry; rm of a bundle still transitively required keeps its vendored tree but drops it from config; rm of an undeclared dep errors. **7 tests.**

Commit: `feat: add and remove dependencies with comment-preserving config edits`.

---

## Task 10: `update`

**Files:** create `src/commands/update.ts`; modify `src/cli.ts`; test `test/commands/update.test.ts`.

`update [pkg]` = sync + human-readable lock diff (spec §10: "re-resolve, report the knowledge diff"). Resolution always reads current `node_modules`, so sync already picks up new versions; update's contribution is the report.

```ts
export function diffLocks(before: Lock | null, after: Lock): string[] {
  const lines: string[] = [];
  const beforeBundles = before?.bundles ?? {};
  const names = new Set([...Object.keys(beforeBundles), ...Object.keys(after.bundles)]);
  for (const name of [...names].sort()) {
    const a = beforeBundles[name];
    const b = after.bundles[name];
    if (!a) lines.push(`+ ${name} v${b.version}`);
    else if (!b) lines.push(`- ${name} v${a.version}`);
    else if (a.version !== b.version) lines.push(`~ ${name} v${a.version} → v${b.version}`);
    else if (a.upstreamHash !== b.upstreamHash) lines.push(`~ ${name} v${b.version} (content changed, same version)`);
  }
  return lines;
}
```

`updateCommand(cwd, pkg?)`: when `pkg` given, verify it is a declared dep (else error). Read old lock, `syncDeps` (frozen: false), print `diffLocks` output or `Already up to date.`. The `pkg` argument narrows the *report* to that name (sync is always whole-tree — partial vendoring would break flat-hoist invariants; say so in the help text).

Tests: version bump reported as `~ name vA → vB`; content change at same version reported (path dep edited in place); added/removed reported; no changes → `Already up to date.`; `update <pkg>` errors on undeclared pkg and filters the report otherwise. **5 tests.**

Commit: `feat: add llmwiki update with a lock diff report`.

---

## Task 11: Checks 9–11

**Files:** create `src/lint/checks/vendored-lock.ts`, `generated-indexes.ts`, `root-links-deps.ts`; modify `src/lint/checks/index.ts`, `src/bundle/load.ts` (README-under-deps exemption), `test/lint/run.test.ts` (order assertion → 11 ids); tests `test/lint/vendored-lock.test.ts`, `test/lint/generated-indexes.test.ts`, `test/lint/root-links-deps.test.ts`.

**`isConceptPage` change** (plan decision 4): also return false when `page.repoPath` matches `^${bundle.root}/deps/.+/README\.md$`. One added test in `test/bundle/load.test.ts`.

**Check 9 (`vendored-lock`)** — the one that makes `deps/` honest:

- lock missing but `deps/` has bundle dirs → error `run llmwiki install`
- lock entry whose `deps/<name>/` dir is missing → error
- bundle dir under `deps/` not in lock → error (hand-added)
- config dep not in lock → error (config changed since install)
- per entry, resolve the producer (graph resolvers, single dep): unresolvable → **warning** `cannot verify vendored bundle "<name>" — dependency not installed` (plan decision 2)
- resolvable: `hashBundle` ≠ `upstreamHash` → error `lock is stale for "<name>" — run llmwiki install`
- hash matches: re-derive — `vendorableFiles` + `rewritePage` in memory, compare with the vendored files — first mismatch → error `<root>/deps/<name>/<file> differs from what install would produce — vendored trees are read-only`
- `mode: link` entries (vendored path is a symlink — `lstatSync`): skip content verification with no finding

**Check 10 (`generated-indexes`)**: regenerate `depsIndexContent` from the lock and `vendorIndexContent` from config + dirs; compare byte-for-byte with the on-disk files; missing-but-needed or stale → error `generated index is stale — run llmwiki install`.

**Check 11 (`root-links-deps`)**: when `<root>/deps/index.md` exists, the root index body must contain `/${root}/deps/index.md`; same for vendor. Error message says what to add.

Registration order appends `'vendored-lock', 'generated-indexes', 'root-links-deps'` after `'link-absolute'`; update `test/lint/run.test.ts`'s array to all 11.

Tests: **check 9** — clean install passes; hand-edited vendored page flagged with the file named; deleted producer (rm -rf the node_modules entry) downgrades to warning, exit stays 0 when it is the only finding; stale hash (bump producer content) flagged; unlocked dir flagged; missing dir flagged; config-not-locked flagged. **check 10** — clean passes; hand-edited deps/index.md flagged; stale after lock change flagged. **check 11** — missing link flagged; present link passes; no deps → silent. Plus the README-under-deps exemption test. **≈12 tests.**

Commit: `feat: add composition lint checks 9-11`.

---

## Task 12: `mode: link`

**Files:** modify `src/vendor/copy.ts` (or a small `src/vendor/link.ts`), `src/commands/install.ts`; test `test/commands/link-mode.test.ts`.

In `syncDeps`, when `config.mode === 'link'`:

- any resolved bundle with non-empty `declaredDeps` → error: `link mode cannot rewrite cross-bundle links; "<name>" declares dependencies — use mode: copy` (§7.2)
- on `process.platform === 'win32'` → push a warning and fall back to copy (§7.2)
- else `symlinkSync(join(bundle.absDir, bundle.producerRoot), join(repoRoot, root, 'deps', ...name.split('/')), 'dir')` after `mkdirSync` of the parent; `clearDeps` already removes old links (`rmSync` handles symlinks)
- lock entries are computed identically (hash over producer content); check 9 already skips symlinked entries

Tests: link mode symlinks instead of copying (lstat is a symlink; a page read through it shows the *unrewritten* producer content); dep-with-deps rejected with the message; lock still written with real hash; `clearDeps` removes symlinks without following them (producer tree intact afterwards — pin this: `rmSync` must not delete through the link); check 9 passes on a linked tree. **5 tests.**

Commit: `feat: support mode link with its recorded limitations`.

---

## Task 13: Integration tests

**Files:** create `test/integration/composition.test.ts`.

Through the built CLI (`dist/cli.js`, `beforeAll` build like the existing integration suite), on temp repos with `writeProducer` fixtures:

1. `init --yes` → `add` a producer (npm fixture in `node_modules/`) → `lint` exits 0 once the root index is amended to link `deps/index.md` (the test writes that link — mirroring what a user does on the printed hint)
2. `lint` exits 1 with `vendored-lock` naming the file after hand-editing a vendored page; `install` heals it; `lint` back to 0
3. `install --frozen` exits 0 on a fresh checkout simulation (delete `deps/`, keep lock) and 1 after the producer content changes
4. dep-with-dep end to end: transitive appears flat, its pages' cross-bundle links resolve (check 4 green)
5. version-conflict fixture: `install` exits 1 naming both requirers
6. `rm` then `lint` exits 0 with `deps/` gone and root-index link removed by the test

**6 tests.**

Commit: `test: cover composition end to end through the CLI`.

---

## Task 14: Docs sync and merge readiness

- Design spec: mark Plan 2 implemented in the Status line; reconcile §7.6's index example with the lock-derivable format (plan decision 5); note check 9's warning-when-unresolvable behaviour in §11's table or prose.
- README: document `add` / `rm` / `install --frozen` / `update` in the quick start (still from-checkout form).
- `npm test` + `npm run typecheck` green; run the full suite twice to shake out order dependence.
- Commit, then merge `feat/composition` into `main` (no remote — local merge, `--no-ff`).

---

## Definition of done

- [ ] `add` → vendored tree + rewritten links + lock + generated index, all reproducible
- [ ] transitive deps hoist flat; conflicts and cycles are hard, named failures
- [ ] `install --frozen` is a real CI gate (verifies, never writes)
- [ ] checks 9–11 registered; run.test order assertion covers 11 ids
- [ ] a hand-edited vendored page cannot survive lint
- [ ] fresh-clone lint (producer uninstalled) warns instead of failing
- [ ] `mode: link` works within its recorded limitations
- [ ] suite green, typecheck clean, docs synced

## Handoff to Plan 3

Plan 3 (skillset) consumes: `Lock.skills` (kept intact by every write here), `packageRoot()` for shipped skill sources, and the `CHECKS` registration seam for check 12 (`skills` staleness, warning severity).
