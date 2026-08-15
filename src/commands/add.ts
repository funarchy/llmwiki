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
    deps: {
      ...config.deps,
      [pkg]: options.path ? { source: 'path' as const, path: options.path } : { source: 'npm' as const },
    },
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
