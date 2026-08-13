# llmwiki Core & Lint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the llmwiki bundle core — config loading, markdown parsing, the in-memory bundle model, lint checks 1–8, and the `init`, `lint` and `gaps` commands — so a repository can scaffold an OKF bundle and hold it to the schema.

**Architecture:** Everything above the filesystem is a pure function over an in-memory model. `bundle/load.ts` walks a bundle root once and produces `Bundle { pages: Page[] }`; every lint check is `(ctx) => Issue[]` over that model with no disk access. `md/links.ts` is the single owner of link syntax and path resolution, which is what lets checks 4, 7 and 8 and (in Plan 2) the vendor rewriter share one definition of "what is a link and where does it point."

**Tech Stack:** TypeScript (ESM, NodeNext), Node ≥20, vitest for tests, `yaml` for frontmatter, `ajv` for config schema validation, `commander` for CLI dispatch. No `remark` — llmwiki owns link resolution because remark-validate-links does not support root-relative links.

**Spec:** `docs/superpowers/specs/2026-08-13-llmwiki-design.md`. Sections referenced as §N.

**Out of scope for this plan:** dependency resolution and vendoring (§7, Plan 2), lint checks 9–11 (Plan 2), the skillset and check 12 (Plan 3), `extract`, `git:` resolution, registry.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/types.ts` | Shared types: `Frontmatter`, `Link`, `Page`, `Bundle`, `Issue`, `Config`, `DepSpec` |
| `src/paths.ts` | Locate the installed package root, for reading `schemas/` and `templates/` |
| `src/md/frontmatter.ts` | Split a markdown file into frontmatter + body, tracking the body's start line |
| `src/md/links.ts` | Extract links with line numbers; classify absolute/relative/external; resolve absolute paths |
| `src/bundle/load.ts` | Walk a bundle root into a `Bundle`; classify concept pages vs index files |
| `src/config.ts` | Find the repo root, load and normalize `llmwiki.yaml`, validate against the shipped schema |
| `src/lint/checks/kebab-case.ts` | Check 1 |
| `src/lint/checks/frontmatter.ts` | Check 2 |
| `src/lint/checks/index-frontmatter.ts` | Check 3 |
| `src/lint/checks/links-resolve.ts` | Check 4 |
| `src/lint/checks/orphans.ts` | Check 5 |
| `src/lint/checks/dir-index.ts` | Check 6 |
| `src/lint/checks/link-reference-style.ts` | Check 7 |
| `src/lint/checks/link-absolute.ts` | Check 8 |
| `src/lint/run.ts` | Assemble `LintContext`, run all checks, format the report, decide the exit code |
| `src/commands/init.ts` | Scaffold the bundle, config, npm wiring and optional pre-commit hook |
| `src/commands/lint.ts` | Load config + bundle, run lint, print, exit |
| `src/commands/gaps.ts` | Read `_meta/eval/` for `to_resolve` cases and scan pages for `**Stub.**` |
| `src/cli.ts` | Commander dispatch and the `bin` entry point |
| `schemas/llmwiki.schema.json` | Config schema, shipped for editor autocomplete and ajv |
| `schemas/page.schema.json` | Page frontmatter schema, copied into a bundle by `init` |
| `templates/root-index.md` | Bundle root `index.md` starter |
| `templates/eval-index.md` | `_meta/eval/index.md` starter |
| `templates/pre-commit.sh` | Git hook that runs `llmwiki lint` |

Tests mirror `src/` under `test/`, plus `test/fixtures/` for on-disk bundle trees.

---

## Spec clarifications this plan settles

1. **`_meta/` is excluded from every page-format check.** It holds `page.schema.json` and eval cases, whose frontmatter (`question`, `status`) is not concept-page frontmatter. `gaps` reads `_meta/eval/` directly rather than through the bundle model. Check 6 also skips it.
2. **Repo root is the directory containing `llmwiki.yaml`**, located by walking up from the current directory. No git dependency, and link resolution is therefore unaffected by the submodule caveat in §16.8.
3. **`README.md` at the bundle root is exempt** from concept-page checks, so a human-facing readme can live in the bundle without frontmatter.

Two deliberate deviations from §15's testing plan:

- **Fixtures are built programmatically** by `makeRepo()` in `test/helpers/fixture.ts` rather than committed under `test/fixtures/`. Each test then states the exact tree it depends on inline, which reads better than cross-referencing a shared directory. The committed fixture trees §15 describes (a conflicting pair, a cyclic pair, a non-default root name) are all Plan 2 concerns and can land there.
- **`init` is covered by property assertions, not a golden snapshot.** A snapshot over generated file contents would fail on every template wording change without catching anything a targeted assertion misses.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.test.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/types.ts`, `src/paths.ts`
- Test: `test/paths.test.ts`

- [ ] **Step 1: Initialize the package and install dependencies**

Run from `/Users/jkbo/funarchy/llmwiki`:

```bash
npm init -y
npm pkg set name=llmwiki version=0.1.0 type=module license=MIT
npm pkg set description="OKF knowledge bundles with dependencies"
npm install yaml ajv commander
npm install -D typescript vitest @types/node
```

Installing with `@latest` semantics (no pinned versions) so the current majors are picked up.

- [ ] **Step 2: Configure package scripts and published files**

Replace the `scripts` block and add `bin`/`files`/`engines` in `package.json`:

```json
{
  "bin": { "llmwiki": "dist/cli.js" },
  "files": ["dist", "schemas", "templates"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.test.json",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`typecheck` deliberately points at `tsconfig.test.json`, which covers `src/`
**and** `test/`. `build` stays on `tsconfig.json` so only `src/` is emitted into
`dist/`. Without this split, test files are never typechecked by anything —
vitest is esbuild-based and strips types without checking them, so a fixture
literal that does not satisfy `Page` or `Config` would pass silently.

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts"]
}
```

ESM with NodeNext means every relative import must carry a `.js` extension, including in `.ts` sources. All code in this plan follows that.

TypeScript 7 does not auto-discover `@types/node`, so add `"types": ["node"]` to `compilerOptions` with a comment noting that any future `@types/*` package shipping globals must be listed there too. tsconfig files are JSONC, so comments are valid.

- [ ] **Step 3b: Write `tsconfig.test.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "."
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

The `rootDir: "."` override is required: the base config sets `rootDir: "src"`, and including `test/` under that fails with "not under rootDir".

Verify the setup works by writing a temporary test file containing `const x: number = "not a number";`, confirming `npm run typecheck` **fails** on it, then deleting it and confirming typecheck passes. Do not commit the temporary file.

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
dist/
*.tsbuildinfo
```

- [ ] **Step 6: Write `src/types.ts`**

```ts
/** Frontmatter of a page. OKF requires consumers to tolerate unknown keys. */
export interface Frontmatter {
  $schema?: string;
  type?: string;
  title?: string;
  description?: string;
  tags?: string[];
  sources?: string[];
  okf_version?: string;
  [key: string]: unknown;
}

/** A link found in a page body. */
export interface Link {
  /** Ref name for a reference definition; undefined for an inline link. */
  ref?: string;
  /** Href as written, with any `#fragment` stripped. */
  href: string;
  /** 1-based line number in the source file. */
  line: number;
  style: 'inline' | 'reference-definition';
}

export interface Page {
  /** Absolute path on disk. */
  absPath: string;
  /** Path from the repo root, forward slashes, no leading slash: `llmwiki/data/mongo.md`. */
  repoPath: string;
  isIndex: boolean;
  frontmatter: Frontmatter | null;
  body: string;
  links: Link[];
}

export interface Bundle {
  /** Absolute path to the bundle root directory. */
  absRoot: string;
  /** Bundle root from the repo root, no leading slash: `llmwiki`. */
  root: string;
  pages: Page[];
}

export interface Issue {
  /** Repo-relative path of the file or directory the issue concerns. */
  file: string;
  line?: number;
  /** Check identifier, e.g. `kebab-case`. */
  check: string;
  message: string;
  severity: 'error' | 'warning';
}

export type DepSource = 'npm' | 'path' | 'git';

export interface DepSpec {
  source: DepSource;
  path?: string;
  url?: string;
  ref?: string;
}

export interface VendorSpec {
  from: string;
}

export interface Config {
  version: 1;
  bundle: { root: string; name?: string; version?: string };
  deps: Record<string, DepSpec>;
  vendor: Record<string, VendorSpec>;
  skills: 'managed' | 'vendored' | 'off';
  mode: 'copy' | 'link';
}
```

- [ ] **Step 7: Write the failing test for `src/paths.ts`**

Create `test/paths.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { packageRoot } from '../src/paths.js';

describe('packageRoot', () => {
  it('points at the directory containing schemas/ and templates/', () => {
    const root = packageRoot();
    expect(existsSync(join(root, 'package.json'))).toBe(true);
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npx vitest run test/paths.test.ts`
Expected: FAIL — cannot resolve `../src/paths.js`.

- [ ] **Step 9: Write `src/paths.ts`**

```ts
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Root of the installed llmwiki package — the directory holding `schemas/`
 * and `templates/`. Works from both `src/` (tests) and `dist/` (published),
 * since both sit one level below the package root.
 */
export function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npx vitest run test/paths.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src test
git commit -m "feat: scaffold llmwiki package with shared types"
```

---

### Task 2: Frontmatter parsing

**Files:**
- Create: `src/md/frontmatter.ts`
- Modify: `src/types.ts` (add `FrontmatterState`, add `frontmatterState` to `Page`)
- Test: `test/md/frontmatter.test.ts`

`bodyStartLine` is the reason this returns a struct rather than a tuple: link line numbers must map back to real file lines, so the body's offset has to travel with it.

**Two things this module must get right, both found by review during execution:**

1. **Normalize CRLF to LF before splitting.** `content.split('\n')` leaves each line's `\r` attached. Interior frontmatter lines rejoin into valid CRLF pairs, but the last line before the closing delimiter ends up with an orphan `\r` — and YAML 1.2 does not treat a bare `\r` as a line break, so it becomes part of that scalar. Verified against yaml 2.9.0: a CRLF file yields `{ type: 'topic', title: 'Mongo\r' }`. That passes a `minLength` schema check while carrying an invisible control character. Normalizing does not disturb `bodyStartLine`, because replacing `\r\n` with `\n` leaves the line count unchanged.

2. **Report *why* there is no frontmatter, not just that there isn't.** A single `null` cannot distinguish "no block at all" from "a block whose YAML failed to parse." Check 3 (Task 8) treats absent frontmatter on an `index.md` as the passing state, so conflating the two lets an index file with a malformed block carrying real metadata slip past the very check meant to catch it. Hence the `FrontmatterState` discriminant.

- [ ] **Step 1: Write the failing tests**

Create `test/md/frontmatter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../../src/md/frontmatter.js';

describe('parseFrontmatter', () => {
  it('reports absent when the file does not open with a delimiter', () => {
    const result = parseFrontmatter('# Title\n\nBody text.\n');
    expect(result.state).toBe('absent');
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe('# Title\n\nBody text.\n');
    expect(result.bodyStartLine).toBe(1);
  });

  it('parses frontmatter and reports where the body starts', () => {
    const content = ['---', 'type: topic', 'title: Mongo', '---', '', 'Body.', ''].join('\n');
    const result = parseFrontmatter(content);
    expect(result.state).toBe('parsed');
    expect(result.frontmatter).toEqual({ type: 'topic', title: 'Mongo' });
    expect(result.body).toBe('\nBody.\n');
    expect(result.bodyStartLine).toBe(5);
  });

  it('reports absent for an unterminated frontmatter block', () => {
    const result = parseFrontmatter('---\ntype: topic\n\nBody.\n');
    expect(result.state).toBe('absent');
    expect(result.frontmatter).toBeNull();
    expect(result.bodyStartLine).toBe(1);
  });

  it('reports invalid for a block whose YAML will not parse', () => {
    const content = ['---', 'type: [unclosed', '---', '', 'Body.'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.state).toBe('invalid');
    expect(result.frontmatter).toBeNull();
    expect(result.bodyStartLine).toBe(4);
  });

  it('reports invalid for a block that parses to something other than a mapping', () => {
    const content = ['---', '- a', '- b', '---', '', 'Body.'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.state).toBe('invalid');
    expect(result.frontmatter).toBeNull();
  });

  it('reports empty for a block that holds nothing', () => {
    const content = ['---', '---', '', 'Body.'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.state).toBe('empty');
    expect(result.frontmatter).toBeNull();
    expect(result.bodyStartLine).toBe(3);
  });

  it('parses a list value', () => {
    const content = ['---', 'sources:', '  - src/a.ts', '  - src/b.ts', '---', 'Body.'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.frontmatter?.sources).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('does not leak a carriage return into the last frontmatter value on a CRLF file', () => {
    const content = '---\r\ntype: topic\r\ntitle: Mongo\r\n---\r\n\r\nBody.\r\n';
    const result = parseFrontmatter(content);
    expect(result.state).toBe('parsed');
    expect(result.frontmatter).toEqual({ type: 'topic', title: 'Mongo' });
    expect(result.body).toBe('\nBody.\n');
    // Line count is unchanged by normalization, so this still indexes the real file.
    expect(result.bodyStartLine).toBe(5);
  });
});
```

The CRLF test is the regression guard for finding 1: without normalization, `title` comes back as `'Mongo\r'` and the assertion fails. The `bodyStartLine` assertion in the `invalid` case pins down that a failed parse still reports the body position correctly — the old implementation returned early with `bodyStartLine: 1` only for `absent`, and it would be easy to regress `invalid` into the same path.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/md/frontmatter.test.ts`
Expected: FAIL — cannot resolve `../../src/md/frontmatter.js`.

- [ ] **Step 3: Write `src/md/frontmatter.ts`**

First add to `src/types.ts`:

```ts
/**
 * What a page's frontmatter delimiter block contained.
 * - `absent`  — no delimited block: no opening `---`, or it was never closed
 * - `empty`   — a block was present but held nothing
 * - `invalid` — a block was present but its YAML would not parse, or was not a mapping
 * - `parsed`  — a block was present and yielded a mapping
 */
export type FrontmatterState = 'absent' | 'empty' | 'invalid' | 'parsed';
```

and add one member to the existing `Page` interface:

```ts
  frontmatterState: FrontmatterState;
```

`FrontmatterState` lives in `types.ts` rather than in `frontmatter.ts` so that `types.ts` stays dependency-free and `Page` can name it.

Then `src/md/frontmatter.ts`:

```ts
import { parse } from 'yaml';
import type { Frontmatter, FrontmatterState } from '../types.js';

export interface ParsedFile {
  /** The parsed mapping. Null unless `state` is `parsed`. */
  frontmatter: Frontmatter | null;
  state: FrontmatterState;
  body: string;
  /** 1-based line number where the body begins. */
  bodyStartLine: number;
}

const DELIM = '---';

export function parseFrontmatter(content: string): ParsedFile {
  // Normalize to LF first: otherwise the last frontmatter line keeps an orphan
  // `\r`, which YAML 1.2 treats as scalar content rather than a line break.
  // Line count is unchanged, so `bodyStartLine` still indexes the real file.
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  const absent: ParsedFile = {
    frontmatter: null,
    state: 'absent',
    body: normalized,
    bodyStartLine: 1,
  };

  // `.trim()` rather than `===` so a leading BOM or trailing space still matches.
  if (lines[0]?.trim() !== DELIM) return absent;

  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === DELIM) {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) return absent;

  const body = lines.slice(closeIdx + 1).join('\n');
  const bodyStartLine = closeIdx + 2;

  let loaded: unknown;
  try {
    loaded = parse(lines.slice(1, closeIdx).join('\n'));
  } catch {
    return { frontmatter: null, state: 'invalid', body, bodyStartLine };
  }

  if (loaded === null || loaded === undefined) {
    return { frontmatter: null, state: 'empty', body, bodyStartLine };
  }
  if (typeof loaded !== 'object' || Array.isArray(loaded)) {
    return { frontmatter: null, state: 'invalid', body, bodyStartLine };
  }
  return { frontmatter: loaded as Frontmatter, state: 'parsed', body, bodyStartLine };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/md/frontmatter.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/md/frontmatter.ts test/md/frontmatter.test.ts
git commit -m "feat: parse page frontmatter with body line tracking"
```

---

### Task 3: Link extraction

**Files:**
- Create: `src/md/links.ts`
- Test: `test/md/links.test.ts`

Code must be stripped before scanning, or example links inside fenced blocks become false findings. Stripping replaces non-newline characters with spaces rather than collapsing the match, so line numbers survive — a bug in the futuramath implementation this replaces.

- [ ] **Step 1: Write the failing tests**

Create `test/md/links.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { stripCode, extractLinks } from '../../src/md/links.js';

describe('stripCode', () => {
  it('blanks fenced blocks but preserves line count', () => {
    const input = ['before', '```', '[x]: /a.md', '```', 'after'].join('\n');
    const out = stripCode(input);
    expect(out.split('\n')).toHaveLength(5);
    expect(out).not.toContain('/a.md');
    expect(out).toContain('before');
    expect(out).toContain('after');
  });

  it('blanks inline code spans', () => {
    const out = stripCode('use `[x](/a.md)` here');
    expect(out).not.toContain('/a.md');
    expect(out).toHaveLength('use `[x](/a.md)` here'.length);
  });
});

describe('extractLinks', () => {
  it('extracts reference definitions with line numbers offset by the body start', () => {
    const body = ['Text.', '', '[data]: /llmwiki/data/index.md'].join('\n');
    const links = extractLinks(body, 5);
    expect(links).toEqual([
      { ref: 'data', href: '/llmwiki/data/index.md', line: 7, style: 'reference-definition' },
    ]);
  });

  it('extracts inline links', () => {
    const links = extractLinks('See [child](/llmwiki/data/child.md) now.', 1);
    expect(links).toEqual([
      { href: '/llmwiki/data/child.md', line: 1, style: 'inline' },
    ]);
  });

  it('strips fragments from hrefs', () => {
    const links = extractLinks('[a]: /llmwiki/x.md#section', 1);
    expect(links[0].href).toBe('/llmwiki/x.md');
  });

  it('ignores links inside fenced code blocks', () => {
    const body = ['```markdown', '[a]: /llmwiki/x.md', '```'].join('\n');
    expect(extractLinks(body, 1)).toEqual([]);
  });

  it('finds multiple inline links on one line', () => {
    const links = extractLinks('[a](/one.md) and [b](/two.md)', 3);
    expect(links.map((l) => l.href)).toEqual(['/one.md', '/two.md']);
    expect(links.every((l) => l.line === 3)).toBe(true);
  });

  it('returns an empty list for a body with no links', () => {
    expect(extractLinks('Just prose.\n', 1)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/md/links.test.ts`
Expected: FAIL — cannot resolve `../../src/md/links.js`.

- [ ] **Step 3: Write `src/md/links.ts`**

```ts
import { join } from 'node:path';
import type { Link } from '../types.js';

const FENCE_RE = /^```[\s\S]*?^```/gm;
const INLINE_CODE_RE = /`{1,2}[^`\n]*`{1,2}/g;
const INLINE_LINK_RE = /\[([^\]]*)\]\(\s*([^)\s]+)/g;
const REF_DEF_RE = /^\[([^\]]+)\]:\s*(\S+)/;

/** Blank out code so example links are never treated as real, preserving line count. */
export function stripCode(text: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return text.replace(FENCE_RE, blank).replace(INLINE_CODE_RE, blank);
}

function stripFragment(href: string): string {
  const i = href.indexOf('#');
  return i === -1 ? href : href.slice(0, i);
}

/**
 * Extract every link in a page body.
 * @param bodyStartLine 1-based line number of the body's first line in the file.
 */
export function extractLinks(body: string, bodyStartLine: number): Link[] {
  const lines = stripCode(body).split('\n');
  const links: Link[] = [];

  lines.forEach((line, i) => {
    const lineNo = bodyStartLine + i;

    const def = REF_DEF_RE.exec(line);
    if (def) {
      links.push({
        ref: def[1],
        href: stripFragment(def[2]),
        line: lineNo,
        style: 'reference-definition',
      });
      return;
    }

    INLINE_LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = INLINE_LINK_RE.exec(line)) !== null) {
      links.push({ href: stripFragment(m[2]), line: lineNo, style: 'inline' });
    }
  });

  return links;
}

/** True for `https://`, `mailto:`, `mongo://` and any other scheme-qualified href. */
export function isExternal(href: string): boolean {
  return /^([a-z][a-z0-9+.-]*:\/\/|mailto:|tel:)/i.test(href);
}

/** True for a repo-root-absolute href, the only form allowed in a body (§3.3). */
export function isRepoAbsolute(href: string): boolean {
  return href.startsWith('/');
}

/** Resolve a repo-root-absolute href to an absolute path on disk. */
export function resolveRepoAbsolute(repoRoot: string, href: string): string {
  return join(repoRoot, href.slice(1));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/md/links.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/md/links.ts test/md/links.test.ts
git commit -m "feat: extract and classify page links"
```

---

### Task 4: Schema helper, config schema and loading

**Files:**
- Create: `schemas/llmwiki.schema.json`, `src/schema.ts`, `src/config.ts`
- Test: `test/schema.test.ts`, `test/config.test.ts`

`src/schema.ts` exists so config validation (here) and page-frontmatter validation (Task 7) share one ajv setup and one error-message format instead of duplicating both.

- [ ] **Step 1: Write `schemas/llmwiki.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "llmwiki.schema.json",
  "title": "llmwiki configuration",
  "type": "object",
  "required": ["version", "bundle"],
  "additionalProperties": false,
  "properties": {
    "version": { "const": 1 },
    "bundle": {
      "type": "object",
      "required": ["root"],
      "additionalProperties": false,
      "properties": {
        "root": { "type": "string", "minLength": 1 },
        "name": { "type": "string", "minLength": 1 },
        "version": { "type": "string", "minLength": 1 }
      }
    },
    "deps": {
      "type": "object",
      "additionalProperties": {
        "oneOf": [
          { "const": "npm" },
          {
            "type": "object",
            "required": ["source"],
            "additionalProperties": false,
            "properties": {
              "source": { "enum": ["npm", "path", "git"] },
              "path": { "type": "string" },
              "url": { "type": "string" },
              "ref": { "type": "string" }
            }
          }
        ]
      }
    },
    "vendor": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["from"],
        "additionalProperties": false,
        "properties": { "from": { "type": "string" } }
      }
    },
    "skills": { "enum": ["managed", "vendored", "off"] },
    "mode": { "enum": ["copy", "link"] }
  }
}
```

- [ ] **Step 2: Write the failing test for the schema helper**

Create `test/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { compileSchema, describeError, formatErrors } from '../src/schema.js';

describe('compileSchema', () => {
  it('compiles a shipped schema and memoizes it', () => {
    const first = compileSchema('llmwiki.schema.json');
    const second = compileSchema('llmwiki.schema.json');
    expect(first).toBe(second);
    expect(first({ version: 1, bundle: { root: 'llmwiki' } })).toBe(true);
  });

  it('reports validation failures on the compiled function', () => {
    const validate = compileSchema('llmwiki.schema.json');
    expect(validate({ version: 1 })).toBe(false);
    expect(formatErrors(validate.errors)).toMatch(/bundle/);
  });
});

describe('describeError', () => {
  it('names a missing required field', () => {
    expect(
      describeError({ keyword: 'required', instancePath: '', schemaPath: '', params: { missingProperty: 'bundle' } }),
    ).toBe('missing required field: bundle');
  });

  it('names an unknown field', () => {
    expect(
      describeError({
        keyword: 'additionalProperties',
        instancePath: '',
        schemaPath: '',
        params: { additionalProperty: 'nonsense' },
      }),
    ).toBe('unknown field: nonsense');
  });

  it('falls back to the instance path and message', () => {
    expect(
      describeError({
        keyword: 'minLength',
        instancePath: '/description',
        schemaPath: '',
        params: {},
        message: 'must NOT have fewer than 10 characters',
      }),
    ).toBe('/description must NOT have fewer than 10 characters');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run test/schema.test.ts`
Expected: FAIL — cannot resolve `../src/schema.js`.

- [ ] **Step 4: Write `src/schema.ts`**

**Use `Ajv2020`, not the default `Ajv` export.** Both schemas declare
`$schema: "https://json-schema.org/draft/2020-12/schema"`, and ajv's default
entry point is draft-07 only — it throws `no schema with key or ref
"https://json-schema.org/draft/2020-12/schema"` at compile time. Verified
against the installed ajv 8.20.0. The draft-2020 class lives at
`ajv/dist/2020.js`; the types still come from the main entry.

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv';
import { packageRoot } from './paths.js';

const cache = new Map<string, ValidateFunction>();

/** Compile a schema from the package's schemas/ directory, memoized by filename. */
export function compileSchema(filename: string): ValidateFunction {
  const cached = cache.get(filename);
  if (cached) return cached;

  const schema = JSON.parse(readFileSync(join(packageRoot(), 'schemas', filename), 'utf-8'));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  cache.set(filename, validate);
  return validate;
}

/** One-line, human-readable description of a single ajv error. */
export function describeError(error: ErrorObject): string {
  if (error.keyword === 'required') {
    return `missing required field: ${(error.params as { missingProperty: string }).missingProperty}`;
  }
  if (error.keyword === 'additionalProperties') {
    return `unknown field: ${(error.params as { additionalProperty: string }).additionalProperty}`;
  }
  return `${error.instancePath || '(root)'} ${error.message}`;
}

export function formatErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? []).map(describeError).join('; ');
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/schema.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Write the failing tests for config loading**

Create `test/config.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findRepoRoot, loadConfig, CONFIG_FILENAME, DEFAULT_ROOT } from '../src/config.js';

function tempRepo(configYaml?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'llmwiki-cfg-'));
  if (configYaml !== undefined) writeFileSync(join(dir, CONFIG_FILENAME), configYaml);
  return dir;
}

describe('findRepoRoot', () => {
  it('finds the directory holding llmwiki.yaml from a nested path', () => {
    const root = tempRepo('version: 1\nbundle:\n  root: llmwiki\n');
    const nested = join(root, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    expect(findRepoRoot(nested)).toBe(root);
  });

  it('returns null when no config exists above the start directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'llmwiki-none-'));
    expect(findRepoRoot(dir)).toBeNull();
  });
});

describe('loadConfig', () => {
  it('applies defaults for optional sections', () => {
    const root = tempRepo('version: 1\nbundle:\n  root: llmwiki\n');
    const config = loadConfig(root);
    expect(config.bundle.root).toBe(DEFAULT_ROOT);
    expect(config.deps).toEqual({});
    expect(config.vendor).toEqual({});
    expect(config.skills).toBe('managed');
    expect(config.mode).toBe('copy');
  });

  it('normalizes the npm shorthand into a DepSpec', () => {
    const root = tempRepo(
      ['version: 1', 'bundle:', '  root: llmwiki', 'deps:', "  '@funarchy/scenepad': npm"].join('\n'),
    );
    const config = loadConfig(root);
    expect(config.deps['@funarchy/scenepad']).toEqual({ source: 'npm' });
  });

  it('keeps a table dep spec intact', () => {
    const root = tempRepo(
      [
        'version: 1',
        'bundle:',
        '  root: llmwiki',
        'deps:',
        "  '@funarchy/koota-pms':",
        '    source: path',
        '    path: ../koota-pms',
      ].join('\n'),
    );
    const config = loadConfig(root);
    expect(config.deps['@funarchy/koota-pms']).toEqual({ source: 'path', path: '../koota-pms' });
  });

  it('rejects an unknown top-level key', () => {
    const root = tempRepo('version: 1\nbundle:\n  root: llmwiki\nnonsense: true\n');
    expect(() => loadConfig(root)).toThrow(/nonsense/);
  });

  it('rejects a missing bundle section', () => {
    const root = tempRepo('version: 1\n');
    expect(() => loadConfig(root)).toThrow(/bundle/);
  });

  it('rejects an unsupported version', () => {
    const root = tempRepo('version: 2\nbundle:\n  root: llmwiki\n');
    expect(() => loadConfig(root)).toThrow(/version/);
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npx vitest run test/config.test.ts`
Expected: FAIL — cannot resolve `../src/config.js`.

- [ ] **Step 8: Write `src/config.ts`**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'yaml';
import { compileSchema, formatErrors } from './schema.js';
import type { Config, DepSpec } from './types.js';

export const CONFIG_FILENAME = 'llmwiki.yaml';
export const DEFAULT_ROOT = 'llmwiki';

/** Walk up from `startDir` to the directory containing llmwiki.yaml. */
export function findRepoRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, CONFIG_FILENAME))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function normalizeDep(value: unknown): DepSpec {
  if (value === 'npm') return { source: 'npm' };
  return value as DepSpec;
}

/** Load, validate and normalize llmwiki.yaml from a repo root. */
export function loadConfig(repoRoot: string): Config {
  const path = join(repoRoot, CONFIG_FILENAME);
  if (!existsSync(path)) {
    throw new Error(`No ${CONFIG_FILENAME} found at ${repoRoot} — run \`llmwiki init\` first.`);
  }

  const raw = parse(readFileSync(path, 'utf-8')) as unknown;
  const validate = compileSchema('llmwiki.schema.json');
  if (!validate(raw)) {
    throw new Error(`Invalid ${CONFIG_FILENAME}: ${formatErrors(validate.errors)}`);
  }

  const data = raw as Partial<Config> & { deps?: Record<string, unknown> };

  const deps: Record<string, DepSpec> = {};
  for (const [name, value] of Object.entries(data.deps ?? {})) {
    deps[name] = normalizeDep(value);
  }

  return {
    version: 1,
    bundle: {
      root: data.bundle?.root ?? DEFAULT_ROOT,
      name: data.bundle?.name,
      version: data.bundle?.version,
    },
    deps,
    vendor: data.vendor ?? {},
    skills: data.skills ?? 'managed',
    mode: data.mode ?? 'copy',
  };
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run test/config.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 10: Commit**

```bash
git add schemas/llmwiki.schema.json src/schema.ts src/config.ts test/schema.test.ts test/config.test.ts
git commit -m "feat: load and validate llmwiki.yaml against a shipped schema"
```

---

### Task 5: Bundle loading

**Files:**
- Create: `src/bundle/load.ts`
- Test: `test/bundle/load.test.ts`, `test/helpers/fixture.ts`

- [ ] **Step 1: Write the fixture helper**

Create `test/helpers/fixture.ts`:

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Build a temporary repo from a map of repo-relative paths to file contents.
 * Returns the repo root.
 */
export function makeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'llmwiki-fx-'));
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(root, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

/** Minimal valid llmwiki.yaml body for a given bundle root. */
export function configYaml(root = 'llmwiki'): string {
  return `version: 1\nbundle:\n  root: ${root}\n`;
}

/** A conformant concept page. */
export function page(title: string, extra = ''): string {
  return [
    '---',
    'type: topic',
    `title: ${title}`,
    `description: What ${title} is and how to use it here`,
    'sources:',
    '  - src/example.ts',
    '---',
    '',
    `${title} answers one question.`,
    extra,
  ].join('\n');
}
```

- [ ] **Step 2: Write the failing tests**

Create `test/bundle/load.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadBundle, isConceptPage } from '../../src/bundle/load.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';

describe('loadBundle', () => {
  it('collects pages with repo-relative posix paths', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Data](/llmwiki/data/index.md) - data\n',
      'llmwiki/data/index.md': '# Data\n\n* [Mongo](/llmwiki/data/mongo.md) - mongo\n',
      'llmwiki/data/mongo.md': page('Mongo'),
    });
    const bundle = loadBundle(root, 'llmwiki');
    expect(bundle.root).toBe('llmwiki');
    expect(bundle.pages.map((p) => p.repoPath).sort()).toEqual([
      'llmwiki/data/index.md',
      'llmwiki/data/mongo.md',
      'llmwiki/index.md',
    ]);
  });

  it('marks index files', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/mongo.md': page('Mongo'),
    });
    const bundle = loadBundle(root, 'llmwiki');
    const index = bundle.pages.find((p) => p.repoPath === 'llmwiki/index.md');
    const concept = bundle.pages.find((p) => p.repoPath === 'llmwiki/mongo.md');
    expect(index?.isIndex).toBe(true);
    expect(concept?.isIndex).toBe(false);
  });

  it('excludes _meta/ entirely', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/_meta/eval/index.md': '# Eval\n',
      'llmwiki/_meta/eval/a-question.md': '---\nquestion: "Q?"\nstatus: to_resolve\n---\n',
    });
    const bundle = loadBundle(root, 'llmwiki');
    expect(bundle.pages.map((p) => p.repoPath)).toEqual(['llmwiki/index.md']);
  });

  it('parses frontmatter and links per page', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/mongo.md': page('Mongo', '\nSee [data][data].\n\n[data]: /llmwiki/index.md\n'),
    });
    const bundle = loadBundle(root, 'llmwiki');
    const mongo = bundle.pages.find((p) => p.repoPath === 'llmwiki/mongo.md')!;
    expect(mongo.frontmatter?.title).toBe('Mongo');
    expect(mongo.links.map((l) => l.href)).toEqual(['/llmwiki/index.md']);
  });

  it('ignores non-markdown files and dotfiles', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/diagram.png': 'not markdown',
      'llmwiki/.hidden.md': page('Hidden'),
    });
    const bundle = loadBundle(root, 'llmwiki');
    expect(bundle.pages.map((p) => p.repoPath)).toEqual(['llmwiki/index.md']);
  });

  it('throws when the bundle root does not exist', () => {
    const root = makeRepo({ 'llmwiki.yaml': configYaml() });
    expect(() => loadBundle(root, 'llmwiki')).toThrow(/llmwiki/);
  });
});

describe('isConceptPage', () => {
  it('excludes index files and the bundle-root README', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/README.md': '# Readme\n',
      'llmwiki/mongo.md': page('Mongo'),
    });
    const bundle = loadBundle(root, 'llmwiki');
    const byPath = (p: string) => bundle.pages.find((x) => x.repoPath === p)!;
    expect(isConceptPage(byPath('llmwiki/index.md'), bundle)).toBe(false);
    expect(isConceptPage(byPath('llmwiki/README.md'), bundle)).toBe(false);
    expect(isConceptPage(byPath('llmwiki/mongo.md'), bundle)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/bundle/load.test.ts`
Expected: FAIL — cannot resolve `../../src/bundle/load.js`.

- [ ] **Step 4: Write `src/bundle/load.ts`**

```ts
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { parseFrontmatter } from '../md/frontmatter.js';
import { extractLinks } from '../md/links.js';
import type { Bundle, Page } from '../types.js';

/** Directories inside a bundle that hold tooling, not pages (clarification 1). */
export const EXCLUDED_DIRS = new Set(['_meta']);

function toRepoPath(repoRoot: string, absPath: string): string {
  return relative(repoRoot, absPath).split(sep).join('/');
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (EXCLUDED_DIRS.has(entry)) continue;
      out.push(...walk(full));
    } else if (entry.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

export function loadBundle(repoRoot: string, root: string): Bundle {
  const absRoot = join(repoRoot, root);
  if (!existsSync(absRoot)) {
    throw new Error(`Bundle root not found: ${root} (looked in ${absRoot})`);
  }

  const pages: Page[] = walk(absRoot).map((absPath) => {
    const content = readFileSync(absPath, 'utf-8');
    const { frontmatter, state, body, bodyStartLine } = parseFrontmatter(content);
    return {
      absPath,
      repoPath: toRepoPath(repoRoot, absPath),
      isIndex: basename(absPath) === 'index.md',
      frontmatter,
      frontmatterState: state,
      body,
      links: extractLinks(body, bodyStartLine),
    };
  });

  return { absRoot, root, pages };
}

/** True when a page must satisfy the concept-page checks (clarification 3). */
export function isConceptPage(page: Page, bundle: Bundle): boolean {
  if (page.isIndex) return false;
  if (page.repoPath === `${bundle.root}/README.md`) return false;
  return true;
}

/** Every directory that contains at least one loaded page, as repo-relative paths. */
export function pageDirectories(bundle: Bundle): string[] {
  const dirs = new Set<string>();
  for (const page of bundle.pages) {
    dirs.add(page.repoPath.split('/').slice(0, -1).join('/'));
  }
  return [...dirs].sort();
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/bundle/load.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/bundle/load.ts test/bundle/load.test.ts test/helpers/fixture.ts
git commit -m "feat: load a bundle root into an in-memory model"
```

---

### Task 6: Lint runner skeleton and check 1 (kebab-case)

**Files:**
- Create: `src/lint/run.ts`, `src/lint/checks/kebab-case.ts`
- Test: `test/lint/kebab-case.test.ts`, `test/helpers/lint.ts`

- [ ] **Step 1: Write the lint test helper**

Create `test/helpers/lint.ts`:

```ts
import { loadBundle } from '../../src/bundle/load.js';
import { loadConfig } from '../../src/config.js';
import type { LintContext } from '../../src/lint/run.js';

/** Build a LintContext from a fixture repo root. */
export function contextFor(repoRoot: string, gitRemote: string | null = null): LintContext {
  const config = loadConfig(repoRoot);
  return {
    repoRoot,
    config,
    bundle: loadBundle(repoRoot, config.bundle.root),
    gitRemote,
  };
}
```

- [ ] **Step 2: Write the failing test**

Create `test/lint/kebab-case.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { kebabCase } from '../../src/lint/checks/kebab-case.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';
import { contextFor } from '../helpers/lint.js';

describe('check: kebab-case', () => {
  it('accepts kebab-case concept page filenames', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/level-progression.md': page('Level progression'),
      'llmwiki/pms2.md': page('PMS 2'),
    });
    expect(kebabCase(contextFor(root))).toEqual([]);
  });

  it('flags camelCase, snake_case and spaces', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/levelProgression.md': page('A'),
      'llmwiki/level_progression.md': page('B'),
      'llmwiki/Level Progression.md': page('C'),
    });
    const issues = kebabCase(contextFor(root));
    expect(issues).toHaveLength(3);
    expect(issues.every((i) => i.check === 'kebab-case' && i.severity === 'error')).toBe(true);
  });

  it('does not flag index.md or the bundle README', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/README.md': '# Readme\n',
    });
    expect(kebabCase(contextFor(root))).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run test/lint/kebab-case.test.ts`
Expected: FAIL — cannot resolve `../../src/lint/checks/kebab-case.js`.

- [ ] **Step 4: Write `src/lint/run.ts`**

```ts
import type { Bundle, Config, Issue } from '../types.js';

export interface LintContext {
  repoRoot: string;
  config: Config;
  bundle: Bundle;
  /** Origin remote URL, or null when unavailable. Used by check 8. */
  gitRemote: string | null;
}

export type Check = (ctx: LintContext) => Issue[];

/** Registered checks, in report order. Plan 2 appends checks 9–11. */
export const CHECKS: Array<{ id: string; run: Check }> = [];

export function registerCheck(id: string, run: Check): void {
  CHECKS.push({ id, run });
}

export function runLint(ctx: LintContext): Issue[] {
  return CHECKS.flatMap(({ run }) => run(ctx));
}

export function formatIssues(issues: Issue[]): string {
  if (issues.length === 0) return 'llmwiki lint ✓  no issues';

  const lines = issues.map((i) => {
    const where = i.line === undefined ? i.file : `${i.file}:${i.line}`;
    const mark = i.severity === 'warning' ? 'warn' : 'error';
    return `  ${mark}  ${where}  [${i.check}] ${i.message}`;
  });

  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.length - errors;
  lines.push('');
  lines.push(`llmwiki lint ✗  ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`);
  return lines.join('\n');
}

/** Exit code: errors fail, warnings do not (§11, check 12 is advisory). */
export function exitCodeFor(issues: Issue[]): number {
  return issues.some((i) => i.severity === 'error') ? 1 : 0;
}
```

- [ ] **Step 5: Write `src/lint/checks/kebab-case.ts`**

```ts
import { basename } from 'node:path';
import { isConceptPage } from '../../bundle/load.js';
import type { Check } from '../run.js';
import type { Issue } from '../../types.js';

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*\.md$/;

export const kebabCase: Check = (ctx) => {
  const issues: Issue[] = [];
  for (const page of ctx.bundle.pages) {
    if (!isConceptPage(page, ctx.bundle)) continue;
    const name = basename(page.repoPath);
    if (!KEBAB_CASE.test(name)) {
      issues.push({
        file: page.repoPath,
        check: 'kebab-case',
        severity: 'error',
        message: `filename is not kebab-case: ${name}`,
      });
    }
  }
  return issues;
};
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run test/lint/kebab-case.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add src/lint test/lint test/helpers/lint.ts
git commit -m "feat: add lint runner and kebab-case filename check"
```

---

### Task 7: Check 2 (page frontmatter)

**Files:**
- Create: `schemas/page.schema.json`, `src/lint/checks/frontmatter.ts`
- Test: `test/lint/frontmatter-check.test.ts`

- [ ] **Step 1: Write `schemas/page.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "page.schema.json",
  "title": "llmwiki page frontmatter",
  "type": "object",
  "required": ["type", "title", "description", "sources"],
  "properties": {
    "$schema": { "type": "string" },
    "type": { "type": "string", "enum": ["topic", "meta"] },
    "title": { "type": "string", "minLength": 1 },
    "description": { "type": "string", "minLength": 10 },
    "tags": { "type": "array", "items": { "type": "string" } },
    "sources": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
    "generated": { "type": "boolean" },
    "verified": { "type": "string" },
    "status": { "type": "string" },
    "stale_after": { "type": "string" }
  }
}
```

`additionalProperties` is deliberately absent: OKF §4.1 requires consumers to tolerate unknown producer keys. The OKF trust and lifecycle fields are listed so editors autocomplete them.

- [ ] **Step 2: Write the failing tests**

Create `test/lint/frontmatter-check.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { frontmatterCheck } from '../../src/lint/checks/frontmatter.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';
import { contextFor } from '../helpers/lint.js';

const base = { 'llmwiki.yaml': configYaml(), 'llmwiki/index.md': '# Root\n' };

describe('check: frontmatter', () => {
  it('accepts a conformant concept page', () => {
    const root = makeRepo({ ...base, 'llmwiki/mongo.md': page('Mongo') });
    expect(frontmatterCheck(contextFor(root))).toEqual([]);
  });

  it('flags a page with no frontmatter', () => {
    const root = makeRepo({ ...base, 'llmwiki/mongo.md': '# Mongo\n\nBody.\n' });
    const issues = frontmatterCheck(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/missing frontmatter/);
  });

  it('flags each missing required field', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': ['---', 'type: topic', '---', '', 'Body.'].join('\n'),
    });
    const messages = frontmatterCheck(contextFor(root)).map((i) => i.message);
    expect(messages.join(' ')).toMatch(/title/);
    expect(messages.join(' ')).toMatch(/description/);
    expect(messages.join(' ')).toMatch(/sources/);
  });

  it('flags an invalid type', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': [
        '---',
        'type: guide',
        'title: Mongo',
        'description: A description long enough to pass',
        'sources:',
        '  - src/a.ts',
        '---',
        '',
        'Body.',
      ].join('\n'),
    });
    const issues = frontmatterCheck(contextFor(root));
    expect(issues.map((i) => i.message).join(' ')).toMatch(/type/);
  });

  it('flags an empty sources array', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': [
        '---',
        'type: topic',
        'title: Mongo',
        'description: A description long enough to pass',
        'sources: []',
        '---',
        '',
        'Body.',
      ].join('\n'),
    });
    expect(frontmatterCheck(contextFor(root)).map((i) => i.message).join(' ')).toMatch(/sources/);
  });

  it('flags a description shorter than 10 characters', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': [
        '---',
        'type: topic',
        'title: Mongo',
        'description: short',
        'sources:',
        '  - src/a.ts',
        '---',
        '',
        'Body.',
      ].join('\n'),
    });
    expect(frontmatterCheck(contextFor(root)).map((i) => i.message).join(' ')).toMatch(/description/);
  });

  it('tolerates unknown producer keys', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': [
        '---',
        'type: topic',
        'title: Mongo',
        'description: A description long enough to pass',
        'sources:',
        '  - src/a.ts',
        'producer_field: anything',
        '---',
        '',
        'Body.',
      ].join('\n'),
    });
    expect(frontmatterCheck(contextFor(root))).toEqual([]);
  });

  it('skips index files', () => {
    const root = makeRepo({ 'llmwiki.yaml': configYaml(), 'llmwiki/index.md': '# Root\n' });
    expect(frontmatterCheck(contextFor(root))).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/lint/frontmatter-check.test.ts`
Expected: FAIL — cannot resolve `../../src/lint/checks/frontmatter.js`.

- [ ] **Step 4: Write `src/lint/checks/frontmatter.ts`**

```ts
import { isConceptPage } from '../../bundle/load.js';
import { compileSchema, describeError } from '../../schema.js';
import type { Check } from '../run.js';
import type { Issue } from '../../types.js';

export const frontmatterCheck: Check = (ctx) => {
  const issues: Issue[] = [];
  const validate = compileSchema('page.schema.json');

  for (const page of ctx.bundle.pages) {
    if (!isConceptPage(page, ctx.bundle)) continue;

    if (page.frontmatterState === 'absent') {
      issues.push({
        file: page.repoPath,
        check: 'frontmatter',
        severity: 'error',
        message: 'missing frontmatter',
      });
      continue;
    }

    if (page.frontmatterState === 'invalid') {
      issues.push({
        file: page.repoPath,
        check: 'frontmatter',
        severity: 'error',
        message: 'frontmatter block present, but its YAML is not a parseable mapping',
      });
      continue;
    }

    // An `empty` block validates as {}, which reports each missing required field.
    if (!validate(page.frontmatter ?? {})) {
      // Read errors immediately: the memoized validator is stateful.
      for (const error of validate.errors ?? []) {
        issues.push({
          file: page.repoPath,
          check: 'frontmatter',
          severity: 'error',
          message: describeError(error),
        });
      }
    }
  }

  return issues;
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/lint/frontmatter-check.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add schemas/page.schema.json src/lint/checks/frontmatter.ts test/lint/frontmatter-check.test.ts
git commit -m "feat: validate page frontmatter against the page schema"
```

---

### Task 8: Check 3 (index frontmatter)

**Files:**
- Create: `src/lint/checks/index-frontmatter.ts`
- Test: `test/lint/index-frontmatter.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/lint/index-frontmatter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { indexFrontmatter } from '../../src/lint/checks/index-frontmatter.js';
import { makeRepo, configYaml } from '../helpers/fixture.js';
import { contextFor } from '../helpers/lint.js';

describe('check: index-frontmatter', () => {
  it('accepts an index with no frontmatter', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/data/index.md': '# Data\n',
    });
    expect(indexFrontmatter(contextFor(root))).toEqual([]);
  });

  it('accepts okf_version on the bundle-root index only', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': "---\nokf_version: '0.2'\n---\n\n# Root\n",
    });
    expect(indexFrontmatter(contextFor(root))).toEqual([]);
  });

  it('flags frontmatter on a non-root index', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/data/index.md': "---\nokf_version: '0.2'\n---\n\n# Data\n",
    });
    const issues = indexFrontmatter(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('llmwiki/data/index.md');
  });

  it('flags a key other than okf_version on the root index', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': "---\nokf_version: '0.2'\ntitle: Root\n---\n\n# Root\n",
    });
    const issues = indexFrontmatter(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/title/);
  });

  it('flags an index whose frontmatter block will not parse, rather than passing it', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Data](/llmwiki/data/index.md) - data\n',
      'llmwiki/data/index.md': '---\ntitle: [unclosed\n---\n\n# Data\n',
    });
    const issues = indexFrontmatter(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('llmwiki/data/index.md');
    expect(issues[0].message).toMatch(/not a parseable mapping/);
  });

  it('flags an empty frontmatter block on a non-root index', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Data](/llmwiki/data/index.md) - data\n',
      'llmwiki/data/index.md': '---\n---\n\n# Data\n',
    });
    expect(indexFrontmatter(contextFor(root))).toHaveLength(1);
  });
});
```

The last two cases are why `FrontmatterState` exists. Under the original single-`null` design both files would have passed this check silently — the malformed one while carrying a real `title:` key.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/lint/index-frontmatter.test.ts`
Expected: FAIL — cannot resolve the check module.

- [ ] **Step 3: Write `src/lint/checks/index-frontmatter.ts`**

```ts
import type { Check } from '../run.js';
import type { Issue } from '../../types.js';

export const indexFrontmatter: Check = (ctx) => {
  const issues: Issue[] = [];
  const rootIndex = `${ctx.bundle.root}/index.md`;

  for (const page of ctx.bundle.pages) {
    if (!page.isIndex) continue;
    // No delimited block at all is the correct state for an index file.
    if (page.frontmatterState === 'absent') continue;

    if (page.frontmatterState === 'invalid') {
      issues.push({
        file: page.repoPath,
        check: 'index-frontmatter',
        severity: 'error',
        message: 'index.md has a frontmatter block whose YAML is not a parseable mapping — index files must have none at all',
      });
      continue;
    }

    if (page.repoPath !== rootIndex) {
      issues.push({
        file: page.repoPath,
        check: 'index-frontmatter',
        severity: 'error',
        message: 'index.md must not have frontmatter — it is a directory router, not a concept page',
      });
      continue;
    }

    const unexpected = Object.keys(page.frontmatter).filter((k) => k !== 'okf_version');
    if (unexpected.length > 0) {
      issues.push({
        file: page.repoPath,
        check: 'index-frontmatter',
        severity: 'error',
        message: `bundle-root index.md may only declare okf_version; found: ${unexpected.join(', ')}`,
      });
    }
  }

  return issues;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/lint/index-frontmatter.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lint/checks/index-frontmatter.ts test/lint/index-frontmatter.test.ts
git commit -m "feat: enforce frontmatter-free index files"
```

---

### Task 9: Check 4 (links resolve)

**Files:**
- Create: `src/lint/checks/links-resolve.ts`
- Test: `test/lint/links-resolve.test.ts`

Only repo-absolute hrefs are resolved here. A relative href is check 8's finding, and resolving it too would report the same mistake twice.

- [ ] **Step 1: Write the failing tests**

Create `test/lint/links-resolve.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { linksResolve } from '../../src/lint/checks/links-resolve.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';
import { contextFor } from '../helpers/lint.js';

describe('check: links-resolve', () => {
  it('accepts an absolute link to an existing file', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Mongo](/llmwiki/mongo.md) - mongo\n',
      'llmwiki/mongo.md': page('Mongo'),
    });
    expect(linksResolve(contextFor(root))).toEqual([]);
  });

  it('flags an absolute link to a missing file with its line number', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/mongo.md': page('Mongo', '\nSee [gone][gone].\n\n[gone]: /llmwiki/gone.md\n'),
    });
    const issues = linksResolve(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('llmwiki/mongo.md');
    expect(issues[0].message).toMatch(/llmwiki\/gone\.md/);
    expect(issues[0].line).toBeGreaterThan(0);
  });

  it('resolves links to files outside the bundle', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'README.md': '# Repo\n',
      'llmwiki/index.md': '# Root\n',
      'llmwiki/mongo.md': page('Mongo', '\nSee [repo][repo].\n\n[repo]: /README.md\n'),
    });
    expect(linksResolve(contextFor(root))).toEqual([]);
  });

  it('skips external URLs', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/mongo.md': page('Mongo', '\nSee [ext][ext].\n\n[ext]: https://example.com/x\n'),
    });
    expect(linksResolve(contextFor(root))).toEqual([]);
  });

  it('skips relative links, which check 8 owns', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/mongo.md': page('Mongo', '\nSee [rel][rel].\n\n[rel]: ../nowhere.md\n'),
    });
    expect(linksResolve(contextFor(root))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/lint/links-resolve.test.ts`
Expected: FAIL — cannot resolve the check module.

- [ ] **Step 3: Write `src/lint/checks/links-resolve.ts`**

```ts
import { existsSync } from 'node:fs';
import { isExternal, isRepoAbsolute, resolveRepoAbsolute } from '../../md/links.js';
import type { Check } from '../run.js';
import type { Issue } from '../../types.js';

export const linksResolve: Check = (ctx) => {
  const issues: Issue[] = [];

  for (const page of ctx.bundle.pages) {
    for (const link of page.links) {
      if (link.href === '' || isExternal(link.href)) continue;
      // Relative hrefs are check 8's finding; skip to avoid double-reporting.
      if (!isRepoAbsolute(link.href)) continue;

      if (!existsSync(resolveRepoAbsolute(ctx.repoRoot, link.href))) {
        issues.push({
          file: page.repoPath,
          line: link.line,
          check: 'links-resolve',
          severity: 'error',
          message: `broken link: ${link.href}`,
        });
      }
    }
  }

  return issues;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/lint/links-resolve.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lint/checks/links-resolve.ts test/lint/links-resolve.test.ts
git commit -m "feat: verify absolute links resolve against the repo root"
```

---

### Task 10: Check 5 (orphans)

**Files:**
- Create: `src/lint/checks/orphans.ts`
- Test: `test/lint/orphans.test.ts`

Reachability is a breadth-first walk from the bundle-root index, following links found in index files only. That is the "every page reachable from an index" rule: a page linked solely from another concept page is still an orphan, because no router leads an agent to it.

- [ ] **Step 1: Write the failing tests**

Create `test/lint/orphans.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { orphans } from '../../src/lint/checks/orphans.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';
import { contextFor } from '../helpers/lint.js';

describe('check: orphans', () => {
  it('accepts pages reachable through nested indexes', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Data](/llmwiki/data/index.md) - data\n',
      'llmwiki/data/index.md': '# Data\n\n* [Mongo](/llmwiki/data/mongo.md) - mongo\n',
      'llmwiki/data/mongo.md': page('Mongo'),
    });
    expect(orphans(contextFor(root))).toEqual([]);
  });

  it('flags a page no index links to', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/mongo.md': page('Mongo'),
    });
    const issues = orphans(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('llmwiki/mongo.md');
  });

  it('flags a page linked only from another concept page', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Mongo](/llmwiki/mongo.md) - mongo\n',
      'llmwiki/mongo.md': page('Mongo', '\nSee [redis][redis].\n\n[redis]: /llmwiki/redis.md\n'),
      'llmwiki/redis.md': page('Redis'),
    });
    const issues = orphans(contextFor(root));
    expect(issues.map((i) => i.file)).toEqual(['llmwiki/redis.md']);
  });

  it('flags an index unreachable from the root index', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/data/index.md': '# Data\n\n* [Mongo](/llmwiki/data/mongo.md) - mongo\n',
      'llmwiki/data/mongo.md': page('Mongo'),
    });
    const files = orphans(contextFor(root)).map((i) => i.file);
    expect(files).toContain('llmwiki/data/mongo.md');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/lint/orphans.test.ts`
Expected: FAIL — cannot resolve the check module.

- [ ] **Step 3: Write `src/lint/checks/orphans.ts`**

```ts
import { isConceptPage } from '../../bundle/load.js';
import { isExternal, isRepoAbsolute } from '../../md/links.js';
import type { Check } from '../run.js';
import type { Issue, Page } from '../../types.js';

/** Repo paths reachable by walking index files from the bundle root index. */
function reachable(pages: Page[], rootIndexPath: string): Set<string> {
  const byPath = new Map(pages.map((p) => [p.repoPath, p]));
  const seen = new Set<string>();
  const queue: string[] = [rootIndexPath];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);

    const page = byPath.get(current);
    // Only routers propagate reachability.
    if (!page?.isIndex) continue;

    for (const link of page.links) {
      if (link.href === '' || isExternal(link.href) || !isRepoAbsolute(link.href)) continue;
      const target = link.href.slice(1);
      if (byPath.has(target)) queue.push(target);
    }
  }

  return seen;
}

export const orphans: Check = (ctx) => {
  const issues: Issue[] = [];
  const rootIndexPath = `${ctx.bundle.root}/index.md`;
  const reached = reachable(ctx.bundle.pages, rootIndexPath);

  for (const page of ctx.bundle.pages) {
    if (page.repoPath === rootIndexPath) continue;
    if (!page.isIndex && !isConceptPage(page, ctx.bundle)) continue;
    if (reached.has(page.repoPath)) continue;

    issues.push({
      file: page.repoPath,
      check: 'orphans',
      severity: 'error',
      message: 'orphan — not reachable by following index.md links from the bundle root',
    });
  }

  return issues;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/lint/orphans.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lint/checks/orphans.ts test/lint/orphans.test.ts
git commit -m "feat: detect pages unreachable from any index"
```

---

### Task 11: Check 6 (every directory has an index)

**Files:**
- Create: `src/lint/checks/dir-index.ts`
- Test: `test/lint/dir-index.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/lint/dir-index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dirIndex } from '../../src/lint/checks/dir-index.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';
import { contextFor } from '../helpers/lint.js';

describe('check: dir-index', () => {
  it('accepts a tree where every page directory has an index', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/data/index.md': '# Data\n',
      'llmwiki/data/mongo.md': page('Mongo'),
    });
    expect(dirIndex(contextFor(root))).toEqual([]);
  });

  it('flags a directory with pages but no index', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/data/mongo.md': page('Mongo'),
    });
    const issues = dirIndex(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('llmwiki/data');
  });

  it('does not require an index inside _meta/', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/_meta/eval/a-question.md': '---\nquestion: "Q?"\nstatus: to_resolve\n---\n',
    });
    expect(dirIndex(contextFor(root))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/lint/dir-index.test.ts`
Expected: FAIL — cannot resolve the check module.

- [ ] **Step 3: Write `src/lint/checks/dir-index.ts`**

```ts
import { pageDirectories } from '../../bundle/load.js';
import type { Check } from '../run.js';
import type { Issue } from '../../types.js';

export const dirIndex: Check = (ctx) => {
  const issues: Issue[] = [];
  const indexDirs = new Set(
    ctx.bundle.pages
      .filter((p) => p.isIndex)
      .map((p) => p.repoPath.split('/').slice(0, -1).join('/')),
  );

  // pageDirectories() derives from loaded pages, and loadBundle excludes _meta/,
  // so excluded directories never appear here.
  for (const dir of pageDirectories(ctx.bundle)) {
    if (!indexDirs.has(dir)) {
      issues.push({
        file: dir,
        check: 'dir-index',
        severity: 'error',
        message: 'directory contains pages but has no index.md',
      });
    }
  }

  return issues;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/lint/dir-index.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lint/checks/dir-index.ts test/lint/dir-index.test.ts
git commit -m "feat: require an index.md in every page directory"
```

---

### Task 12: Check 7 (reference-style links)

**Files:**
- Create: `src/lint/checks/link-reference-style.ts`
- Test: `test/lint/link-reference-style.test.ts`

Concept page bodies must use reference definitions; index files use inline links by design (§3.2), so they are exempt.

- [ ] **Step 1: Write the failing tests**

Create `test/lint/link-reference-style.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { linkReferenceStyle } from '../../src/lint/checks/link-reference-style.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';
import { contextFor } from '../helpers/lint.js';

const base = { 'llmwiki.yaml': configYaml(), 'llmwiki/index.md': '# Root\n' };

describe('check: link-reference-style', () => {
  it('accepts reference-style links in a concept page', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': page('Mongo', '\nSee [data][data].\n\n[data]: /llmwiki/index.md\n'),
    });
    expect(linkReferenceStyle(contextFor(root))).toEqual([]);
  });

  it('flags an inline link in a concept page', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': page('Mongo', '\nSee [data](/llmwiki/index.md).\n'),
    });
    const issues = linkReferenceStyle(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].check).toBe('link-reference-style');
    expect(issues[0].line).toBeGreaterThan(0);
  });

  it('allows inline links in index files', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Mongo](/llmwiki/mongo.md) - mongo\n',
      'llmwiki/mongo.md': page('Mongo'),
    });
    expect(linkReferenceStyle(contextFor(root))).toEqual([]);
  });

  it('does not flag inline links inside code fences', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': page('Mongo', '\n```markdown\n[x](/llmwiki/index.md)\n```\n'),
    });
    expect(linkReferenceStyle(contextFor(root))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/lint/link-reference-style.test.ts`
Expected: FAIL — cannot resolve the check module.

- [ ] **Step 3: Write `src/lint/checks/link-reference-style.ts`**

```ts
import { isConceptPage } from '../../bundle/load.js';
import type { Check } from '../run.js';
import type { Issue } from '../../types.js';

export const linkReferenceStyle: Check = (ctx) => {
  const issues: Issue[] = [];

  for (const page of ctx.bundle.pages) {
    if (!isConceptPage(page, ctx.bundle)) continue;

    for (const link of page.links) {
      if (link.style !== 'inline') continue;
      issues.push({
        file: page.repoPath,
        line: link.line,
        check: 'link-reference-style',
        severity: 'error',
        message: `inline link \`${link.href}\` — use a reference definition in the page footer instead`,
      });
    }
  }

  return issues;
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/lint/link-reference-style.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lint/checks/link-reference-style.ts test/lint/link-reference-style.test.ts
git commit -m "feat: require reference-style links in concept pages"
```

---

### Task 13: Check 8 (absolute paths and in-repo GitHub URLs)

**Files:**
- Create: `src/lint/checks/link-absolute.ts`, `src/git.ts`
- Test: `test/lint/link-absolute.test.ts`, `test/git.test.ts`

- [ ] **Step 1: Write the failing test for the git helper**

Create `test/git.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseGitHubSlug } from '../src/git.js';

describe('parseGitHubSlug', () => {
  it('parses an ssh remote', () => {
    expect(parseGitHubSlug('git@github.com:funarchy/llmwiki.git')).toBe('funarchy/llmwiki');
  });

  it('parses an https remote with and without .git', () => {
    expect(parseGitHubSlug('https://github.com/funarchy/llmwiki.git')).toBe('funarchy/llmwiki');
    expect(parseGitHubSlug('https://github.com/funarchy/llmwiki')).toBe('funarchy/llmwiki');
  });

  it('returns null for a non-GitHub remote', () => {
    expect(parseGitHubSlug('git@gitlab.com:foo/bar.git')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseGitHubSlug(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/git.test.ts`
Expected: FAIL — cannot resolve `../src/git.js`.

- [ ] **Step 3: Write `src/git.ts`**

```ts
import { execFileSync } from 'node:child_process';

/** Origin remote URL, or null when git is unavailable or there is no remote. */
export function gitRemote(repoRoot: string): string | null {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch {
    return null;
  }
}

/** `owner/repo` for a GitHub remote, else null. */
export function parseGitHubSlug(remote: string | null): string | null {
  if (!remote) return null;
  const match = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(remote);
  return match ? `${match[1]}/${match[2]}` : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/git.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing tests for check 8**

Create `test/lint/link-absolute.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { linkAbsolute } from '../../src/lint/checks/link-absolute.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';
import { contextFor } from '../helpers/lint.js';

const base = { 'llmwiki.yaml': configYaml(), 'llmwiki/index.md': '# Root\n' };

describe('check: link-absolute', () => {
  it('accepts repo-root-absolute links', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': page('Mongo', '\nSee [a][a].\n\n[a]: /llmwiki/index.md\n'),
    });
    expect(linkAbsolute(contextFor(root))).toEqual([]);
  });

  it('flags a relative link', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': page('Mongo', '\nSee [a][a].\n\n[a]: ./index.md\n'),
    });
    const issues = linkAbsolute(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/repo-root-absolute/);
  });

  it('flags a parent-relative link', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/data/index.md': '# Data\n\n* [Up](../index.md) - up\n',
      'llmwiki/data/mongo.md': page('Mongo'),
    });
    expect(linkAbsolute(contextFor(root))).toHaveLength(1);
  });

  it('accepts external URLs', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': page('Mongo', '\nSee [a][a].\n\n[a]: https://example.com/docs\n'),
    });
    expect(linkAbsolute(contextFor(root))).toEqual([]);
  });

  it('flags a GitHub blob URL pointing at this same repository', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': page(
        'Mongo',
        '\nSee [a][a].\n\n[a]: https://github.com/funarchy/llmwiki/blob/main/src/cli.ts\n',
      ),
    });
    const ctx = contextFor(root, 'git@github.com:funarchy/llmwiki.git');
    const issues = linkAbsolute(ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/same repository/);
  });

  it('allows a GitHub URL for a different repository', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': page(
        'Mongo',
        '\nSee [a][a].\n\n[a]: https://github.com/other/project/blob/main/readme.md\n',
      ),
    });
    const ctx = contextFor(root, 'git@github.com:funarchy/llmwiki.git');
    expect(linkAbsolute(ctx)).toEqual([]);
  });

  it('skips the in-repo GitHub check when there is no remote', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': page(
        'Mongo',
        '\nSee [a][a].\n\n[a]: https://github.com/funarchy/llmwiki/blob/main/src/cli.ts\n',
      ),
    });
    expect(linkAbsolute(contextFor(root, null))).toEqual([]);
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run test/lint/link-absolute.test.ts`
Expected: FAIL — cannot resolve the check module.

- [ ] **Step 7: Write `src/lint/checks/link-absolute.ts`**

```ts
import { isExternal, isRepoAbsolute } from '../../md/links.js';
import { parseGitHubSlug } from '../../git.js';
import type { Check } from '../run.js';
import type { Issue } from '../../types.js';

export const linkAbsolute: Check = (ctx) => {
  const issues: Issue[] = [];
  const ownSlug = parseGitHubSlug(ctx.gitRemote);

  for (const page of ctx.bundle.pages) {
    for (const link of page.links) {
      if (link.href === '') continue;

      if (isExternal(link.href)) {
        if (ownSlug) {
          const match = /^https?:\/\/github\.com\/([^/]+\/[^/]+)\/(?:blob|tree)\//.exec(link.href);
          if (match && match[1] === ownSlug) {
            issues.push({
              file: page.repoPath,
              line: link.line,
              check: 'link-absolute',
              severity: 'error',
              message: `GitHub URL points at the same repository — use a repo-root-absolute path instead: ${link.href}`,
            });
          }
        }
        continue;
      }

      if (!isRepoAbsolute(link.href)) {
        issues.push({
          file: page.repoPath,
          line: link.line,
          check: 'link-absolute',
          severity: 'error',
          message: `link \`${link.href}\` must be repo-root-absolute, e.g. /${ctx.bundle.root}/path/page.md`,
        });
      }
    }
  }

  return issues;
};
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run test/lint/link-absolute.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 9: Commit**

```bash
git add src/git.ts src/lint/checks/link-absolute.ts test/git.test.ts test/lint/link-absolute.test.ts
git commit -m "feat: enforce repo-root-absolute link paths"
```

---

### Task 14: Register checks and wire the lint command

**Files:**
- Create: `src/lint/checks/index.ts`, `src/commands/lint.ts`, `src/cli.ts`
- Test: `test/lint/run.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/lint/run.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { runLint, formatIssues, exitCodeFor, CHECKS } from '../../src/lint/run.js';
import '../../src/lint/checks/index.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';
import { contextFor } from '../helpers/lint.js';

describe('runLint', () => {
  it('registers all eight checks', () => {
    expect(CHECKS.map((c) => c.id)).toEqual([
      'kebab-case',
      'frontmatter',
      'index-frontmatter',
      'links-resolve',
      'orphans',
      'dir-index',
      'link-reference-style',
      'link-absolute',
    ]);
  });

  it('returns no issues for a conformant bundle', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': "---\nokf_version: '0.2'\n---\n\n# Root\n\n* [Data](/llmwiki/data/index.md) - data\n",
      'llmwiki/data/index.md': '# Data\n\n* [Mongo](/llmwiki/data/mongo.md) - mongo\n',
      'llmwiki/data/mongo.md': page('Mongo'),
    });
    const issues = runLint(contextFor(root));
    expect(issues).toEqual([]);
    expect(formatIssues(issues)).toMatch(/no issues/);
    expect(exitCodeFor(issues)).toBe(0);
  });

  it('collects issues from multiple checks at once', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/badName.md': '# No frontmatter\n\nSee [x](./nope.md).\n',
    });
    const issues = runLint(contextFor(root));
    const checks = new Set(issues.map((i) => i.check));
    expect(checks).toContain('kebab-case');
    expect(checks).toContain('frontmatter');
    expect(checks).toContain('orphans');
    expect(checks).toContain('link-absolute');
    expect(exitCodeFor(issues)).toBe(1);
  });

  it('exits 0 when only warnings are present', () => {
    expect(exitCodeFor([{ file: 'a.md', check: 'x', severity: 'warning', message: 'm' }])).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/lint/run.test.ts`
Expected: FAIL — cannot resolve `../../src/lint/checks/index.js`.

- [ ] **Step 3: Write `src/lint/checks/index.ts`**

```ts
import { registerCheck } from '../run.js';
import { kebabCase } from './kebab-case.js';
import { frontmatterCheck } from './frontmatter.js';
import { indexFrontmatter } from './index-frontmatter.js';
import { linksResolve } from './links-resolve.js';
import { orphans } from './orphans.js';
import { dirIndex } from './dir-index.js';
import { linkReferenceStyle } from './link-reference-style.js';
import { linkAbsolute } from './link-absolute.js';

/** Importing this module registers every check exactly once, in report order. */
registerCheck('kebab-case', kebabCase);
registerCheck('frontmatter', frontmatterCheck);
registerCheck('index-frontmatter', indexFrontmatter);
registerCheck('links-resolve', linksResolve);
registerCheck('orphans', orphans);
registerCheck('dir-index', dirIndex);
registerCheck('link-reference-style', linkReferenceStyle);
registerCheck('link-absolute', linkAbsolute);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/lint/run.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write `src/commands/lint.ts`**

```ts
import { loadBundle } from '../bundle/load.js';
import { findRepoRoot, loadConfig } from '../config.js';
import { gitRemote } from '../git.js';
import { runLint, formatIssues, exitCodeFor, type LintContext } from '../lint/run.js';
import '../lint/checks/index.js';

export function buildContext(cwd: string): LintContext {
  const repoRoot = findRepoRoot(cwd);
  if (!repoRoot) {
    throw new Error('No llmwiki.yaml found in this directory or any parent — run `llmwiki init` first.');
  }
  const config = loadConfig(repoRoot);
  return {
    repoRoot,
    config,
    bundle: loadBundle(repoRoot, config.bundle.root),
    gitRemote: gitRemote(repoRoot),
  };
}

export function lintCommand(cwd: string): number {
  const issues = runLint(buildContext(cwd));
  const output = formatIssues(issues);
  if (issues.length === 0) console.log(output);
  else console.error(output);
  return exitCodeFor(issues);
}
```

- [ ] **Step 6: Write `src/cli.ts`**

```ts
#!/usr/bin/env node
import { Command } from 'commander';
import { lintCommand } from './commands/lint.js';

/**
 * Run a command body, turning any thrown error into a message plus exit code 1.
 * Every action goes through this — a command that throws must never surface as
 * an unhandled rejection or a stack trace.
 */
async function runAction(work: () => number | Promise<number>): Promise<void> {
  try {
    process.exitCode = await work();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const program = new Command();

program
  .name('llmwiki')
  .description('OKF knowledge bundles with dependencies')
  .showHelpAfterError();

program
  .command('lint')
  .description("run the mechanical checks over this repository's bundle")
  .action(async () => {
    await runAction(() => lintCommand(process.cwd()));
  });

await program.parseAsync();
```

`parseAsync` plus top-level `await` is what lets an async action (Task 18's `init`) propagate its errors through `runAction` rather than escaping as an unhandled rejection.

- [ ] **Step 7: Build and smoke-test the CLI against a fixture**

```bash
npm run build
mkdir -p /tmp/llmwiki-smoke/llmwiki
printf 'version: 1\nbundle:\n  root: llmwiki\n' > /tmp/llmwiki-smoke/llmwiki.yaml
printf '# Root\n' > /tmp/llmwiki-smoke/llmwiki/index.md
node dist/cli.js lint --help
(cd /tmp/llmwiki-smoke && node /Users/jkbo/funarchy/llmwiki/dist/cli.js lint; echo "exit=$?")
```

Expected: help text prints; the lint run prints `llmwiki lint ✓  no issues` and `exit=0`.

- [ ] **Step 8: Commit**

```bash
git add src/lint/checks/index.ts src/commands/lint.ts src/cli.ts test/lint/run.test.ts
git commit -m "feat: wire the lint command and register all eight checks"
```

---

### Task 15: The gaps command

**Files:**
- Create: `src/commands/gaps.ts`
- Test: `test/commands/gaps.test.ts`

`gaps` reads `_meta/eval/` directly, because eval cases are not concept pages and the bundle model excludes `_meta/` (clarification 1).

- [ ] **Step 1: Write the failing tests**

Create `test/commands/gaps.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { collectGaps, formatGaps } from '../../src/commands/gaps.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';

const evalCase = (question: string, status: string, pagesNeeded?: string[]) =>
  [
    '---',
    `question: "${question}"`,
    'added: 2026-08-13',
    `status: ${status}`,
    ...(pagesNeeded ? ['pages-needed:', ...pagesNeeded.map((p) => `  - ${p}`)] : []),
    '---',
    '',
    '## Current wiki answer',
    '',
    'Nothing yet.',
  ].join('\n');

describe('collectGaps', () => {
  it('collects to_resolve eval cases with their pages-needed', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/_meta/eval/index.md': '# Eval\n',
      'llmwiki/_meta/eval/add-a-drill.md': evalCase('How do I add a drill?', 'to_resolve', [
        'llmwiki/drills/add-drill.md — how to add a drill',
      ]),
      'llmwiki/_meta/eval/what-is-pms.md': evalCase('What is PMS?', 'satisfied'),
    });
    const gaps = collectGaps(root, 'llmwiki');
    expect(gaps.evalGaps).toHaveLength(1);
    expect(gaps.evalGaps[0].question).toBe('How do I add a drill?');
    expect(gaps.evalGaps[0].pagesNeeded).toEqual(['llmwiki/drills/add-drill.md — how to add a drill']);
  });

  it('collects stub pages', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Mongo](/llmwiki/mongo.md) - mongo\n',
      'llmwiki/mongo.md': page('Mongo', '\n**Stub.** Needs writing.\n'),
    });
    const gaps = collectGaps(root, 'llmwiki');
    expect(gaps.stubs).toEqual([{ title: 'Mongo', repoPath: 'llmwiki/mongo.md' }]);
  });

  it('returns empty collections when there is nothing to report', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
    });
    const gaps = collectGaps(root, 'llmwiki');
    expect(gaps.evalGaps).toEqual([]);
    expect(gaps.stubs).toEqual([]);
  });

  it('tolerates a missing _meta/eval directory', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
    });
    expect(() => collectGaps(root, 'llmwiki')).not.toThrow();
  });
});

describe('formatGaps', () => {
  it('prints "(none)" for empty sections', () => {
    const out = formatGaps({ evalGaps: [], stubs: [] });
    expect(out).toMatch(/## Open gaps\n\n\(none\)/);
    expect(out).toMatch(/## Wiki pages that need content\n\n\(none\)/);
  });

  it('lists questions with their needed pages', () => {
    const out = formatGaps({
      evalGaps: [{ question: 'How do I add a drill?', pagesNeeded: ['llmwiki/a.md — a page'] }],
      stubs: [{ title: 'Mongo', repoPath: 'llmwiki/mongo.md' }],
    });
    expect(out).toContain('1. How do I add a drill?');
    expect(out).toContain('llmwiki/a.md — a page');
    expect(out).toContain('Mongo - llmwiki/mongo.md');
  });

  it('notes when a gap needs no new pages', () => {
    const out = formatGaps({ evalGaps: [{ question: 'Q?', pagesNeeded: [] }], stubs: [] });
    expect(out).toMatch(/no new pages needed/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/commands/gaps.test.ts`
Expected: FAIL — cannot resolve `../../src/commands/gaps.js`.

- [ ] **Step 3: Write `src/commands/gaps.ts`**

```ts
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadBundle, isConceptPage } from '../bundle/load.js';
import { findRepoRoot, loadConfig } from '../config.js';
import { parseFrontmatter } from '../md/frontmatter.js';

export interface EvalGap {
  question: string;
  pagesNeeded: string[];
}

export interface StubPage {
  title: string;
  repoPath: string;
}

export interface Gaps {
  evalGaps: EvalGap[];
  stubs: StubPage[];
}

const STUB_MARKER = '**Stub.**';

export function collectGaps(repoRoot: string, bundleRoot: string): Gaps {
  const evalDir = join(repoRoot, bundleRoot, '_meta', 'eval');
  const evalGaps: EvalGap[] = [];

  if (existsSync(evalDir)) {
    for (const entry of readdirSync(evalDir).sort()) {
      if (!entry.endsWith('.md') || entry === 'index.md') continue;
      const { frontmatter } = parseFrontmatter(readFileSync(join(evalDir, entry), 'utf-8'));
      if (!frontmatter || frontmatter.status !== 'to_resolve') continue;
      evalGaps.push({
        question: String(frontmatter.question ?? entry),
        pagesNeeded: Array.isArray(frontmatter['pages-needed'])
          ? (frontmatter['pages-needed'] as unknown[]).map(String)
          : [],
      });
    }
  }

  const bundle = loadBundle(repoRoot, bundleRoot);
  const stubs: StubPage[] = bundle.pages
    .filter((page) => isConceptPage(page, bundle) && page.body.includes(STUB_MARKER))
    .map((page) => ({
      title: String(page.frontmatter?.title ?? page.repoPath),
      repoPath: page.repoPath,
    }));

  return { evalGaps, stubs };
}

export function formatGaps(gaps: Gaps): string {
  const lines: string[] = ['## Open gaps', ''];

  if (gaps.evalGaps.length === 0) {
    lines.push('(none)');
  } else {
    gaps.evalGaps.forEach((gap, i) => {
      lines.push(`${i + 1}. ${gap.question}`);
      if (gap.pagesNeeded.length === 0) {
        lines.push('   (no new pages needed — an existing page needs updating, or re-run the eval)');
      } else {
        lines.push('   Pages needed:');
        for (const needed of gap.pagesNeeded) lines.push(`   - ${needed}`);
      }
    });
  }

  lines.push('', '## Wiki pages that need content', '');

  if (gaps.stubs.length === 0) {
    lines.push('(none)');
  } else {
    for (const stub of gaps.stubs) lines.push(`- ${stub.title} - ${stub.repoPath}`);
  }

  return lines.join('\n');
}

export function gapsCommand(cwd: string): number {
  const repoRoot = findRepoRoot(cwd);
  if (!repoRoot) {
    throw new Error('No llmwiki.yaml found in this directory or any parent — run `llmwiki init` first.');
  }
  const config = loadConfig(repoRoot);
  console.log(formatGaps(collectGaps(repoRoot, config.bundle.root)));
  return 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/commands/gaps.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Register the command in `src/cli.ts`**

Add the import below the existing `lintCommand` import:

```ts
import { gapsCommand } from './commands/gaps.js';
```

Add this block after the `lint` command registration, above the `await program.parseAsync()` line:

```ts
program
  .command('gaps')
  .description('list unresolved eval cases and pages marked **Stub.**')
  .action(async () => {
    await runAction(() => gapsCommand(process.cwd()));
  });
```

- [ ] **Step 6: Verify the command runs**

```bash
npm run build
(cd /tmp/llmwiki-smoke && node /Users/jkbo/funarchy/llmwiki/dist/cli.js gaps)
```

Expected: prints `## Open gaps` / `(none)` and `## Wiki pages that need content` / `(none)`.

- [ ] **Step 7: Commit**

```bash
git add src/commands/gaps.ts src/cli.ts test/commands/gaps.test.ts
git commit -m "feat: add the gaps command for eval gaps and stub pages"
```

---

### Task 16: Init templates

**Files:**
- Create: `templates/root-index.md`, `templates/eval-index.md`, `templates/pre-commit.sh`
- Test: `test/templates.test.ts`

- [ ] **Step 1: Write `templates/root-index.md`**

```markdown
---
okf_version: '0.2'
---

# {{BUNDLE_TITLE}}

The knowledge base for how this repository works. Each section covers one
domain; follow links to the topic you need.

Nothing here yet. Add the first section with the `wiki-ingest` skill, then link
its `index.md` from this list.
```

- [ ] **Step 2: Write `templates/eval-index.md`**

```markdown
# Eval cases

Questions used to test whether an agent can navigate this bundle to a correct
answer. Managed by the `wiki-eval` skill; list unresolved ones with
`llmwiki gaps`.
```

- [ ] **Step 3: Write `templates/pre-commit.sh`**

```bash
#!/bin/sh
# Installed by `llmwiki init`. Blocks a commit when the bundle fails lint.
exec npx --no-install llmwiki lint
```

- [ ] **Step 4: Write the failing test**

Create `test/templates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageRoot } from '../src/paths.js';

const templates = ['root-index.md', 'eval-index.md', 'pre-commit.sh'];

describe('templates', () => {
  it.each(templates)('%s exists', (name) => {
    expect(existsSync(join(packageRoot(), 'templates', name))).toBe(true);
  });

  it('root-index.md carries the title placeholder and okf_version', () => {
    const content = readFileSync(join(packageRoot(), 'templates', 'root-index.md'), 'utf-8');
    expect(content).toContain('{{BUNDLE_TITLE}}');
    expect(content).toContain("okf_version: '0.2'");
  });
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/templates.test.ts`
Expected: PASS, 4 tests. (The templates were written first, so this test passes immediately — it is a regression guard against the files being dropped from `package.json#files`.)

- [ ] **Step 6: Commit**

```bash
git add templates test/templates.test.ts
git commit -m "feat: add init templates for the bundle root, eval index and git hook"
```

---

### Task 17: Init scaffolding (non-interactive core)

**Files:**
- Create: `src/commands/init.ts`
- Test: `test/commands/init.test.ts`

`init` is split so its file-writing core is a pure-ish function taking resolved options; the prompts land in Task 18. That keeps every scaffolding assertion testable without stdin.

- [ ] **Step 1: Write the failing tests**

Create `test/commands/init.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInit } from '../../src/commands/init.js';
import { loadConfig } from '../../src/config.js';
import { makeRepo } from '../helpers/fixture.js';

describe('runInit', () => {
  it('scaffolds the bundle, config and eval index', () => {
    const root = makeRepo({});
    runInit({ repoRoot: root, bundleRoot: 'llmwiki', installHook: false, title: 'Demo' });

    expect(existsSync(join(root, 'llmwiki.yaml'))).toBe(true);
    expect(existsSync(join(root, 'llmwiki', 'index.md'))).toBe(true);
    expect(existsSync(join(root, 'llmwiki', '_meta', 'page.schema.json'))).toBe(true);
    expect(existsSync(join(root, 'llmwiki', '_meta', 'eval', 'index.md'))).toBe(true);
  });

  it('substitutes the bundle title into the root index', () => {
    const root = makeRepo({});
    runInit({ repoRoot: root, bundleRoot: 'llmwiki', installHook: false, title: 'Scenepad' });
    const index = readFileSync(join(root, 'llmwiki', 'index.md'), 'utf-8');
    expect(index).toContain('# Scenepad');
    expect(index).not.toContain('{{BUNDLE_TITLE}}');
  });

  it('writes a config that loads and validates', () => {
    const root = makeRepo({});
    runInit({ repoRoot: root, bundleRoot: 'knowledge', installHook: false, title: 'Demo' });
    const config = loadConfig(root);
    expect(config.bundle.root).toBe('knowledge');
    expect(config.skills).toBe('managed');
    expect(config.mode).toBe('copy');
  });

  it('adds the bundle root, config and lint script to package.json', () => {
    const root = makeRepo({ 'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }, null, 2) });
    runInit({ repoRoot: root, bundleRoot: 'llmwiki', installHook: false, title: 'Demo' });
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    expect(pkg.files).toEqual(expect.arrayContaining(['llmwiki', 'llmwiki.yaml']));
    expect(pkg.scripts['llmwiki:lint']).toBe('llmwiki lint');
  });

  it('does not duplicate existing package.json files entries', () => {
    const root = makeRepo({
      'package.json': JSON.stringify({ name: 'demo', files: ['llmwiki', 'dist'] }, null, 2),
    });
    runInit({ repoRoot: root, bundleRoot: 'llmwiki', installHook: false, title: 'Demo' });
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    expect(pkg.files.filter((f: string) => f === 'llmwiki')).toHaveLength(1);
  });

  it('succeeds in a repository with no package.json', () => {
    const root = makeRepo({});
    expect(() =>
      runInit({ repoRoot: root, bundleRoot: 'llmwiki', installHook: false, title: 'Demo' }),
    ).not.toThrow();
  });

  it('refuses to overwrite an existing config', () => {
    const root = makeRepo({ 'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\n' });
    expect(() =>
      runInit({ repoRoot: root, bundleRoot: 'llmwiki', installHook: false, title: 'Demo' }),
    ).toThrow(/already/);
  });

  it('adopts an existing bundle directory without clobbering its index', () => {
    const root = makeRepo({ 'wiki/index.md': '# Existing\n\n* [A](/wiki/a.md) - a\n' });
    runInit({ repoRoot: root, bundleRoot: 'wiki', installHook: false, title: 'Demo' });
    expect(readFileSync(join(root, 'wiki', 'index.md'), 'utf-8')).toContain('# Existing');
    expect(existsSync(join(root, 'wiki', '_meta', 'page.schema.json'))).toBe(true);
  });

  it('installs a pre-commit hook when asked and .git/hooks exists', () => {
    const root = makeRepo({ '.git/hooks/.keep': '' });
    runInit({ repoRoot: root, bundleRoot: 'llmwiki', installHook: true, title: 'Demo' });
    const hook = join(root, '.git', 'hooks', 'pre-commit');
    expect(existsSync(hook)).toBe(true);
    expect(readFileSync(hook, 'utf-8')).toContain('llmwiki lint');
  });

  it('reports an existing docs/ directory without touching it', () => {
    const root = makeRepo({ 'docs/guide.md': '# Guide\n' });
    const result = runInit({ repoRoot: root, bundleRoot: 'llmwiki', installHook: false, title: 'Demo' });
    expect(result.foundDocsDir).toBe(true);
    expect(readFileSync(join(root, 'docs', 'guide.md'), 'utf-8')).toBe('# Guide\n');
  });

  it('does not overwrite an existing pre-commit hook', () => {
    const root = makeRepo({ '.git/hooks/pre-commit': '#!/bin/sh\necho mine\n' });
    const result = runInit({ repoRoot: root, bundleRoot: 'llmwiki', installHook: true, title: 'Demo' });
    expect(readFileSync(join(root, '.git', 'hooks', 'pre-commit'), 'utf-8')).toContain('echo mine');
    expect(result.hookSkipped).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/commands/init.test.ts`
Expected: FAIL — cannot resolve `../../src/commands/init.js`.

- [ ] **Step 3: Write `src/commands/init.ts`**

```ts
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_FILENAME, DEFAULT_ROOT } from '../config.js';
import { packageRoot } from '../paths.js';

export interface InitOptions {
  repoRoot: string;
  bundleRoot: string;
  installHook: boolean;
  /** Heading for the generated root index. */
  title: string;
}

export interface InitResult {
  bundleRoot: string;
  adoptedExisting: boolean;
  wrotePackageJson: boolean;
  hookInstalled: boolean;
  hookSkipped: boolean;
  foundDocsDir: boolean;
}

/** Directories that look like an existing bundle, in preference order. */
export const ADOPTION_CANDIDATES = ['llmwiki', 'wiki', join('docs', 'wiki')];

export function findAdoptableRoot(repoRoot: string): string | null {
  for (const candidate of ADOPTION_CANDIDATES) {
    if (existsSync(join(repoRoot, candidate, 'index.md'))) return candidate;
  }
  return null;
}

function configYaml(bundleRoot: string): string {
  return [
    'version: 1',
    '',
    'bundle:',
    `  root: ${bundleRoot}`,
    '',
    'deps: {}',
    '',
    'vendor: {}',
    '',
    'skills: managed',
    'mode: copy',
    '',
  ].join('\n');
}

function updatePackageJson(repoRoot: string, bundleRoot: string): boolean {
  const pkgPath = join(repoRoot, 'package.json');
  if (!existsSync(pkgPath)) return false;

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
    files?: string[];
    scripts?: Record<string, string>;
  };

  const files = new Set(pkg.files ?? []);
  files.add(bundleRoot);
  files.add(CONFIG_FILENAME);
  pkg.files = [...files];

  pkg.scripts = { ...pkg.scripts, 'llmwiki:lint': 'llmwiki lint' };

  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  return true;
}

export function runInit(options: InitOptions): InitResult {
  const { repoRoot, bundleRoot, installHook, title } = options;

  if (existsSync(join(repoRoot, CONFIG_FILENAME))) {
    throw new Error(`${CONFIG_FILENAME} already exists in ${repoRoot} — nothing to initialize.`);
  }

  const absBundle = join(repoRoot, bundleRoot);
  const rootIndexPath = join(absBundle, 'index.md');
  const adoptedExisting = existsSync(rootIndexPath);

  mkdirSync(join(absBundle, '_meta', 'eval'), { recursive: true });

  if (!adoptedExisting) {
    const template = readFileSync(join(packageRoot(), 'templates', 'root-index.md'), 'utf-8');
    writeFileSync(rootIndexPath, template.replaceAll('{{BUNDLE_TITLE}}', title));
  }

  copyFileSync(
    join(packageRoot(), 'schemas', 'page.schema.json'),
    join(absBundle, '_meta', 'page.schema.json'),
  );

  const evalIndexPath = join(absBundle, '_meta', 'eval', 'index.md');
  if (!existsSync(evalIndexPath)) {
    copyFileSync(join(packageRoot(), 'templates', 'eval-index.md'), evalIndexPath);
  }

  writeFileSync(join(repoRoot, CONFIG_FILENAME), configYaml(bundleRoot));

  const wrotePackageJson = updatePackageJson(repoRoot, bundleRoot);

  let hookInstalled = false;
  let hookSkipped = false;
  const hooksDir = join(repoRoot, '.git', 'hooks');
  if (installHook && existsSync(hooksDir)) {
    const hookPath = join(hooksDir, 'pre-commit');
    if (existsSync(hookPath)) {
      hookSkipped = true;
    } else {
      copyFileSync(join(packageRoot(), 'templates', 'pre-commit.sh'), hookPath);
      chmodSync(hookPath, 0o755);
      hookInstalled = true;
    }
  }

  return {
    bundleRoot,
    adoptedExisting,
    wrotePackageJson,
    hookInstalled,
    hookSkipped,
    foundDocsDir: existsSync(join(repoRoot, 'docs')),
  };
}

export { DEFAULT_ROOT };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/commands/init.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/commands/init.ts test/commands/init.test.ts
git commit -m "feat: scaffold a bundle with llmwiki init"
```

---

### Task 18: Init prompts and CLI registration

**Files:**
- Create: `src/prompt.ts`
- Modify: `src/commands/init.ts` (append `initCommand`), `src/cli.ts`
- Test: `test/prompt.test.ts`

Prompts use `node:readline/promises` rather than a dependency, and `--yes` skips them so tests and CI never block on stdin.

- [ ] **Step 1: Write the failing tests**

Create `test/prompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { ask, confirm } from '../src/prompt.js';

function streams(input: string) {
  const stdin = Readable.from([input]) as unknown as NodeJS.ReadableStream;
  const chunks: string[] = [];
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk));
      cb();
    },
  }) as unknown as NodeJS.WritableStream;
  return { stdin, stdout, chunks };
}

describe('ask', () => {
  it('returns the typed answer', async () => {
    const { stdin, stdout } = streams('knowledge\n');
    await expect(ask('Bundle root', 'llmwiki', { stdin, stdout })).resolves.toBe('knowledge');
  });

  it('returns the default on an empty answer', async () => {
    const { stdin, stdout } = streams('\n');
    await expect(ask('Bundle root', 'llmwiki', { stdin, stdout })).resolves.toBe('llmwiki');
  });

  it('shows the default in the prompt text', async () => {
    const { stdin, stdout, chunks } = streams('\n');
    await ask('Bundle root', 'llmwiki', { stdin, stdout });
    expect(chunks.join('')).toContain('llmwiki');
  });
});

describe('confirm', () => {
  it('accepts y and n', async () => {
    const yes = streams('y\n');
    await expect(confirm('Install hook?', true, { stdin: yes.stdin, stdout: yes.stdout })).resolves.toBe(true);
    const no = streams('n\n');
    await expect(confirm('Install hook?', true, { stdin: no.stdin, stdout: no.stdout })).resolves.toBe(false);
  });

  it('returns the default on an empty answer', async () => {
    const { stdin, stdout } = streams('\n');
    await expect(confirm('Install hook?', false, { stdin, stdout })).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/prompt.test.ts`
Expected: FAIL — cannot resolve `../src/prompt.js`.

- [ ] **Step 3: Write `src/prompt.ts`**

```ts
import { createInterface } from 'node:readline/promises';

export interface PromptIO {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
}

function defaultIO(): PromptIO {
  return { stdin: process.stdin, stdout: process.stdout };
}

/** Ask for a line of text, falling back to `fallback` on an empty answer. */
export async function ask(question: string, fallback: string, io: PromptIO = defaultIO()): Promise<string> {
  const rl = createInterface({ input: io.stdin, output: io.stdout });
  try {
    const answer = await rl.question(`${question} [${fallback}]: `);
    return answer.trim() === '' ? fallback : answer.trim();
  } finally {
    rl.close();
  }
}

/** Ask a yes/no question. */
export async function confirm(question: string, fallback: boolean, io: PromptIO = defaultIO()): Promise<boolean> {
  const hint = fallback ? 'Y/n' : 'y/N';
  const rl = createInterface({ input: io.stdin, output: io.stdout });
  try {
    const answer = (await rl.question(`${question} [${hint}]: `)).trim().toLowerCase();
    if (answer === '') return fallback;
    return answer.startsWith('y');
  } finally {
    rl.close();
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/prompt.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Append `initCommand` to `src/commands/init.ts`**

Add these imports at the top of the file:

```ts
import { basename } from 'node:path';
import { ask, confirm } from '../prompt.js';
```

Append at the end of the file:

```ts
export interface InitCommandOptions {
  /** Skip prompts and take every default. */
  yes: boolean;
}

function titleFrom(repoRoot: string): string {
  const name = basename(repoRoot);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} knowledge base`;
}

export async function initCommand(cwd: string, options: InitCommandOptions): Promise<number> {
  const adoptable = findAdoptableRoot(cwd);
  const suggested = adoptable ?? DEFAULT_ROOT;

  let bundleRoot = suggested;
  let installHook = true;

  if (!options.yes) {
    if (adoptable) {
      console.log(`Found an existing bundle at ${adoptable}/ — it can be adopted as-is.`);
    }
    bundleRoot = await ask('Bundle root', suggested);
    installHook = await confirm('Install a git pre-commit hook that runs llmwiki lint?', true);
  }

  const result = runInit({ repoRoot: cwd, bundleRoot, installHook, title: titleFrom(cwd) });

  console.log(`${result.adoptedExisting ? 'Adopted' : 'Created'} bundle root: ${result.bundleRoot}/`);
  console.log(`Wrote ${CONFIG_FILENAME}`);
  if (result.wrotePackageJson) {
    console.log(`Added ${result.bundleRoot} and ${CONFIG_FILENAME} to package.json#files, plus an llmwiki:lint script`);
  }
  if (result.hookInstalled) console.log('Installed .git/hooks/pre-commit');
  if (result.hookSkipped) console.log('Left the existing .git/hooks/pre-commit in place');
  if (result.foundDocsDir) {
    console.log('Found a docs/ directory. Migrating it is the wiki-ingest skill\'s job — nothing was touched.');
  }
  console.log('Next: run `llmwiki lint`.');

  return 0;
}
```

- [ ] **Step 6: Register the command in `src/cli.ts`**

Add the import:

```ts
import { initCommand } from './commands/init.js';
```

Add this block before the `lint` registration:

```ts
program
  .command('init')
  .description('scaffold an llmwiki bundle in this repository')
  .option('-y, --yes', 'accept all defaults without prompting', false)
  .action(async (opts: { yes: boolean }) => {
    await runAction(() => initCommand(process.cwd(), { yes: opts.yes }));
  });
```

- [ ] **Step 7: Verify init end-to-end on a fresh directory**

```bash
npm run build
rm -rf /tmp/llmwiki-init && mkdir -p /tmp/llmwiki-init && cd /tmp/llmwiki-init && git init -q
node /Users/jkbo/funarchy/llmwiki/dist/cli.js init --yes
node /Users/jkbo/funarchy/llmwiki/dist/cli.js lint; echo "lint exit=$?"
cd /Users/jkbo/funarchy/llmwiki
```

Expected: init reports the created bundle root, `llmwiki.yaml`, and the installed pre-commit hook; lint prints `no issues` with `lint exit=0`.

- [ ] **Step 8: Commit**

```bash
git add src/prompt.ts src/commands/init.ts src/cli.ts test/prompt.test.ts
git commit -m "feat: add interactive prompts and register the init command"
```

---

### Task 19: End-to-end CLI integration test

**Files:**
- Test: `test/integration/cli.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/integration/cli.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageRoot } from '../../src/paths.js';

const CLI = join(packageRoot(), 'dist', 'cli.js');

function run(args: string[], cwd: string): { stdout: string; status: number } {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf-8' });
    return { stdout, status: 0 };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; status?: number };
    return { stdout: `${e.stdout ?? ''}${e.stderr ?? ''}`, status: e.status ?? 1 };
  }
}

describe('llmwiki CLI', () => {
  beforeAll(() => {
    execFileSync('npm', ['run', 'build'], { cwd: packageRoot(), stdio: 'ignore' });
  });

  it('init then lint succeeds on a fresh repository', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'llmwiki-e2e-'));
    const init = run(['init', '--yes'], cwd);
    expect(init.status).toBe(0);
    expect(existsSync(join(cwd, 'llmwiki.yaml'))).toBe(true);

    const lint = run(['lint'], cwd);
    expect(lint.status).toBe(0);
    expect(lint.stdout).toMatch(/no issues/);
  });

  it('lint exits 1 and names the failing check on a broken page', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'llmwiki-e2e-'));
    run(['init', '--yes'], cwd);
    writeFileSync(join(cwd, 'llmwiki', 'badName.md'), '# No frontmatter\n');

    const lint = run(['lint'], cwd);
    expect(lint.status).toBe(1);
    expect(lint.stdout).toMatch(/kebab-case/);
    expect(lint.stdout).toMatch(/frontmatter/);
  });

  it('gaps reports empty sections on a fresh bundle', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'llmwiki-e2e-'));
    run(['init', '--yes'], cwd);
    const gaps = run(['gaps'], cwd);
    expect(gaps.status).toBe(0);
    expect(gaps.stdout).toMatch(/## Open gaps/);
  });

  it('lint fails clearly outside an initialized repository', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'llmwiki-e2e-'));
    const lint = run(['lint'], cwd);
    expect(lint.status).toBe(1);
    expect(lint.stdout).toMatch(/llmwiki init/);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run test/integration/cli.test.ts`
Expected: PASS, 4 tests. The "fails clearly outside an initialized repository" case is what proves `runAction` (Task 14) catches the `findRepoRoot` failure and prints the message rather than a stack trace.

- [ ] **Step 3: Run the whole suite and typecheck**

```bash
npm run typecheck
npm test
```

Expected: typecheck clean; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add test/integration/cli.test.ts src/cli.ts
git commit -m "test: cover init, lint and gaps end-to-end through the CLI"
```

---

### Task 20: Correct the spec's sources-check claim and add a README

**Files:**
- Modify: `docs/superpowers/specs/2026-08-13-llmwiki-design.md` (§7.5)
- Create: `README.md`

§7.5 currently says lint "skips source-path checks under `deps/**` and `vendor/**`", which implies a check that does not exist in the twelve. `sources:` entries legitimately include non-path forms (`mongo://collections`, external URLs), so v1 verifies only that the array is present and non-empty (check 2).

- [ ] **Step 1: Read the current §7.5 text**

Run: `grep -n -A 8 '7.5 Vendored' docs/superpowers/specs/2026-08-13-llmwiki-design.md`

- [ ] **Step 2: Replace the section body**

Replace the paragraph reading `A vendored scenepad page citing …` through `… verifiable in the consumer when they are not.` with:

```markdown
A vendored scenepad page citing `src/pms/runtime.ts` means *scenepad's*
repository root, not the consumer's.

v1 does not verify that `sources:` paths resolve anywhere — entries are
identifiers, and legitimate ones include database URIs (`mongo://collections`)
and external URLs alongside repo paths. Check 2 verifies only that `sources:` is
present and non-empty. Should a future staleness check compare a page against
its sources, it must skip `deps/**` and `vendor/**`, where the paths belong to
another repository.

Vendored source paths are deliberately **not** rewritten. Rewriting would make
them look verifiable in the consumer when they are not. The generated
`deps/index.md` states the convention instead.
```

- [ ] **Step 3: Write `README.md`**

````markdown
# llmwiki

A knowledge base that lives in your repository — [OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)-conformant
markdown pages that agents navigate along explicit links instead of similarity
search — plus the dependency layer OKF leaves out of scope.

## Status

Early. The bundle core, the linter, and `init` / `lint` / `gaps` work. The
dependency layer (`add`, `install`, vendoring) and the agent skillset are next.

## Quick start

```bash
npx llmwiki init      # scaffold llmwiki/ and llmwiki.yaml
npx llmwiki lint      # hold the bundle to the schema
npx llmwiki gaps      # list unresolved eval cases and stub pages
```

## Design

The full specification, including the dependency model, lives in
[docs/superpowers/specs/2026-08-13-llmwiki-design.md](docs/superpowers/specs/2026-08-13-llmwiki-design.md).

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```
````

- [ ] **Step 4: Verify the spec edit landed and nothing else references a sources check**

```bash
grep -n 'source-path checks' docs/superpowers/specs/2026-08-13-llmwiki-design.md; echo "exit=$?"
```

Expected: `exit=1` (no matches — the old wording is gone).

- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers/specs/2026-08-13-llmwiki-design.md
git commit -m "docs: correct the sources-check claim in §7.5 and add a README"
```

---

## Definition of done

- [ ] `npm test` passes; `npm run typecheck` is clean; `npm run build` produces `dist/cli.js`
- [ ] `npx llmwiki init --yes` in an empty git repository produces a bundle that `llmwiki lint` accepts
- [ ] All eight checks are registered in the order asserted by `test/lint/run.test.ts`
- [ ] `lint` exits 1 on errors, 0 on warnings only
- [ ] `gaps` reads `_meta/eval/` and reports stubs
- [ ] §7.5 of the spec no longer claims a `sources:` path check exists

## Handoff to Plan 2

Plan 2 (composition) builds on these seams and should not need to modify them:

- `Bundle` / `Page` / `Link` in `src/types.ts` — vendored bundles load through the same `loadBundle`
- `registerCheck` in `src/lint/run.ts` — checks 9–11 append without touching checks 1–8
- `md/links.ts` — `isRepoAbsolute` and `resolveRepoAbsolute` are what the prefix rewriter builds on
- `Config.deps` / `Config.vendor` / `Config.mode` — already parsed, validated and normalized, currently unused
- `src/lock.ts` does not exist yet; Plan 2 creates it
