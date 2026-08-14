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
