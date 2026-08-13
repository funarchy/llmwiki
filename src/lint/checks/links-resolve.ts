import { existsSync } from 'node:fs';
import { isExternal, isRepoAbsolute, resolveRepoAbsolute } from '../../md/links.js';
import type { Check } from '../run.js';
import type { Issue } from '../../types.js';

export const linksResolve: Check = (ctx) => {
  const issues: Issue[] = [];

  for (const page of ctx.bundle.pages) {
    for (const link of page.links) {
      if (link.href === '' || isExternal(link.href)) continue;
      // Relative hrefs are check 8's finding; skip to avoid double-reporting.
      if (!isRepoAbsolute(link.href)) continue;

      const target = resolveRepoAbsolute(ctx.repoRoot, link.href);

      if (target === null) {
        issues.push({
          file: page.repoPath,
          line: link.line,
          check: 'links-resolve',
          severity: 'error',
          message: `link escapes the repository root: ${link.href}`,
        });
        continue;
      }

      if (!existsSync(target)) {
        issues.push({
          file: page.repoPath,
          line: link.line,
          check: 'links-resolve',
          severity: 'error',
          message: `broken link: ${link.href}`,
        });
      }
    }
  }

  return issues;
};
