import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Top-level producer directories that are never vendored (§7.2 + plan decision 3). */
const EXCLUDED_TOP = new Set(['_meta', 'deps', 'vendor']);

/**
 * Files to vendor from a producer bundle, as posix paths relative to its root,
 * sorted. Excludes the top-level tooling dirs, the producer's bundle-root
 * README.md (its front door, not knowledge), and dot-entries. Includes non-md
 * assets (images exist for humans). Skips unstattable entries (dangling
 * symlinks), matching the loader.
 */
export function vendorableFiles(absBundleRoot: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.')) continue;
      if (rel === '' && (EXCLUDED_TOP.has(entry) || entry === 'README.md')) continue;
      const abs = join(dir, entry);
      let isDir: boolean;
      try {
        isDir = statSync(abs).isDirectory();
      } catch {
        continue;
      }
      const childRel = rel === '' ? entry : `${rel}/${entry}`;
      if (isDir) walk(abs, childRel);
      else out.push(childRel);
    }
  };
  walk(absBundleRoot, '');
  return out.sort();
}
