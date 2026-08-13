import { pageDirectories } from '../../bundle/load.js';
import type { Check } from '../run.js';
import type { Issue } from '../../types.js';

export const dirIndex: Check = (ctx) => {
  const issues: Issue[] = [];
  const indexDirs = new Set(
    ctx.bundle.pages
      .filter((p) => p.isIndex)
      .map((p) => p.repoPath.split('/').slice(0, -1).join('/')),
  );

  // pageDirectories() derives from loaded pages, and loadBundle excludes _meta/,
  // so excluded directories never appear here.
  for (const dir of pageDirectories(ctx.bundle)) {
    if (!indexDirs.has(dir)) {
      issues.push({
        file: dir,
        check: 'dir-index',
        severity: 'error',
        message: 'directory contains pages but has no index.md',
      });
    }
  }

  return issues;
};
