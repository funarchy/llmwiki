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
