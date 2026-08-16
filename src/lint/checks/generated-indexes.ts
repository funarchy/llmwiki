import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { depsIndexContent, vendorDirsOf, vendorIndexContent } from '../../generate/indexes.js';
import { readLock } from '../../lock.js';
import type { Check } from '../run.js';
import type { Issue } from '../../types.js';

/**
 * Both generated indexes are derivable from the lock and config alone (plan
 * decision 5), so this check regenerates them in memory and compares
 * byte-for-byte with what is on disk — it never needs a producer present.
 */
export const generatedIndexes: Check = (ctx) => {
  const { repoRoot, config } = ctx;
  const root = config.bundle.root;
  const issues: Issue[] = [];
  const lock = readLock(repoRoot);

  if (lock && Object.keys(lock.bundles).length > 0) {
    const path = join(repoRoot, root, 'deps', 'index.md');
    const expected = depsIndexContent(root, lock);
    const actual = existsSync(path) ? readFileSync(path, 'utf-8') : null;
    if (actual !== expected) {
      issues.push({
        file: `${root}/deps/index.md`,
        check: 'generated-indexes',
        severity: 'error',
        message: 'generated index is stale — run `wiki-sticky install`',
      });
    }
  }

  const vendorDirs = vendorDirsOf(repoRoot, root);
  if (vendorDirs.length > 0) {
    const path = join(repoRoot, root, 'vendor', 'index.md');
    const expected = vendorIndexContent(root, config, vendorDirs);
    const actual = existsSync(path) ? readFileSync(path, 'utf-8') : null;
    if (actual !== expected) {
      issues.push({
        file: `${root}/vendor/index.md`,
        check: 'generated-indexes',
        severity: 'error',
        message: 'generated index is stale — run `wiki-sticky install`',
      });
    }
  }

  return issues;
};
