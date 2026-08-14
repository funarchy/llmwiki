import { mkdirSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ResolvedBundle } from '../types.js';

/**
 * Symlink one resolved bundle's producer root into `<consumerRoot>/deps/<name>/`
 * (`mode: link`, §7.2). No content is copied or rewritten — the consumer reads
 * the producer's files directly, unrewritten links and all.
 */
export function linkBundle(repoRoot: string, consumerRoot: string, bundle: ResolvedBundle): void {
  const target = join(bundle.absDir, bundle.producerRoot);
  const dest = join(repoRoot, consumerRoot, 'deps', ...bundle.name.split('/'));
  mkdirSync(dirname(dest), { recursive: true });
  symlinkSync(target, dest, 'dir');
}
