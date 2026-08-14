import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vendorableFiles } from './files.js';

/**
 * Deterministic fingerprint of a producer bundle's vendorable content, before
 * any rewriting. Uses the same file list as vendoring, so hash and copy can
 * never disagree about scope. Path and bytes both contribute: a rename with
 * identical content changes the hash.
 */
export function hashBundle(absBundleRoot: string): string {
  const outer = createHash('sha256');
  for (const rel of vendorableFiles(absBundleRoot)) {
    const inner = createHash('sha256').update(readFileSync(join(absBundleRoot, rel))).digest('hex');
    outer.update(`${rel}\0${inner}\n`);
  }
  return `sha256-${outer.digest('hex')}`;
}
