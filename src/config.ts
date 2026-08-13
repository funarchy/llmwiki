import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { parse } from 'yaml';
import { compileSchema, formatErrors } from './schema.js';
import type { Config, DepSpec } from './types.js';

export const CONFIG_FILENAME = 'llmwiki.yaml';
export const DEFAULT_ROOT = 'llmwiki';

/**
 * Walk up from `startDir` to the directory containing llmwiki.yaml.
 *
 * The walk is unbounded, matching how `package.json` resolution behaves. A stray
 * config above the working directory is therefore picked up silently — acceptable,
 * and the same bargain every other tool in this ecosystem makes.
 */
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

/**
 * The bundle root must name a directory strictly inside the repository.
 *
 * JSON Schema cannot express this robustly — the same reason `resolveRepoAbsolute`
 * clamps procedurally rather than by pattern. Unlike that clamp, there is no reason
 * to tolerate an escape here: `bundle.root` is this repository's own content root,
 * never a vendored symlink target. Rejecting the root directory itself is
 * deliberate too, since a bundle at the repo root would make the loader walk
 * `node_modules/` and every other non-bundle directory.
 */
export function validateBundleRoot(root: string, repoRoot: string): void {
  const base = resolve(repoRoot);
  const abs = resolve(base, root);
  if (abs === base || !abs.startsWith(base + sep)) {
    throw new Error(
      `Invalid ${CONFIG_FILENAME}: bundle.root must name a directory inside the repository, got "${root}"`,
    );
  }
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

  // `root` is optional in the schema so this default is live, not dead code.
  const root = data.bundle?.root ?? DEFAULT_ROOT;
  validateBundleRoot(root, repoRoot);

  return {
    version: 1,
    bundle: {
      root,
      name: data.bundle?.name,
      version: data.bundle?.version,
    },
    deps,
    vendor: data.vendor ?? {},
    skills: data.skills ?? 'managed',
    mode: data.mode ?? 'copy',
  };
}
