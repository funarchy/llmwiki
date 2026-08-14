import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { findRepoRoot, loadConfig } from '../config.js';
import { readLock, writeLock, locksEqual, LOCK_FILENAME } from '../lock.js';
import { resolveGraph } from '../resolve/graph.js';
import { hashBundle } from '../vendor/hash.js';
import { clearDeps, vendorBundle } from '../vendor/copy.js';
import { generateIndexes } from '../generate/indexes.js';
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
