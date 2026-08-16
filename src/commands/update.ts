import { findRepoRoot, loadConfig } from '../config.js';
import { readLock } from '../lock.js';
import { syncDeps, rootIndexHints } from './install.js';
import type { Lock } from '../types.js';

/**
 * Human-readable diff between two locks, by bundle name: `+` added, `-`
 * removed, `~ vA → vB` a version change, `~ vX (content changed, same
 * version)` when only the upstream hash moved.
 */
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

/**
 * `update [pkg]`: sync is always whole-tree — partial vendoring would break
 * the flat-hoist invariants that let a producer's cross-bundle links resolve.
 * The optional `pkg` only narrows the printed report to that bundle's line,
 * and errors if `pkg` is not a declared dependency.
 */
export function updateCommand(cwd: string, pkg?: string): number {
  const repoRoot = findRepoRoot(cwd);
  if (!repoRoot) throw new Error('No wiki-sticky.yaml found — run `wiki-sticky init` first.');

  const config = loadConfig(repoRoot);
  if (pkg && !config.deps[pkg]) throw new Error(`"${pkg}" is not a dependency.`);

  const before = readLock(repoRoot);
  const { lock, warnings } = syncDeps(repoRoot, config, { frozen: false });

  let lines = diffLocks(before, lock);
  if (pkg) lines = lines.filter((line) => line.startsWith(`+ ${pkg} `) || line.startsWith(`- ${pkg} `) || line.startsWith(`~ ${pkg} `));

  if (lines.length === 0) {
    console.log('Already up to date.');
  } else {
    for (const line of lines) console.log(line);
  }
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const hint of rootIndexHints(repoRoot, config, lock)) console.log(hint);
  return 0;
}
