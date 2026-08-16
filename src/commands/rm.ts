import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { findRepoRoot, loadConfig, CONFIG_FILENAME } from '../config.js';
import { syncDeps, rootIndexHints } from './install.js';

/**
 * Remove a declared dependency and re-sync. Sync recomputes the whole `deps/`
 * tree from the resulting config, so a bundle still required transitively by
 * another remaining dep stays vendored — only bundles nothing depends on any
 * more disappear.
 */
export function rmCommand(cwd: string, pkg: string): number {
  const repoRoot = findRepoRoot(cwd);
  if (!repoRoot) throw new Error('No wiki-sticky.yaml found — run `wiki-sticky init` first.');

  const config = loadConfig(repoRoot);
  if (!config.deps[pkg]) throw new Error(`"${pkg}" is not a dependency.`);

  const configPath = join(repoRoot, CONFIG_FILENAME);
  const doc = parseDocument(readFileSync(configPath, 'utf-8'));
  doc.deleteIn(['deps', pkg]);
  writeFileSync(configPath, String(doc));

  const updated = loadConfig(repoRoot);
  const { lock, bundles, warnings } = syncDeps(repoRoot, updated, { frozen: false });
  console.log(`Removed "${pkg}". Vendored ${bundles.length} bundle${bundles.length === 1 ? '' : 's'}.`);
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const hint of rootIndexHints(repoRoot, updated, lock)) console.log(hint);
  return 0;
}
