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
