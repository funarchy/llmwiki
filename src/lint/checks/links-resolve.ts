import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { isExternal, isRepoAbsolute, resolveRepoAbsolute } from '../../md/links.js';
import type { Check } from '../run.js';
import type { Issue } from '../../types.js';

export const linksResolve: Check = (ctx) => {
  const issues: Issue[] = [];

  // Directory listings, memoized per run. `readdirSync` returns real, case-preserved
  // names, so membership is case-exact where `existsSync` is not.
  const entriesByDir = new Map<string, Set<string>>();
  const entriesOf = (dir: string): Set<string> => {
    let entries = entriesByDir.get(dir);
    if (!entries) {
      try {
        entries = new Set(readdirSync(dir));
      } catch {
        entries = new Set();
      }
      entriesByDir.set(dir, entries);
    }
    return entries;
  };

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

      // On a case-sensitive filesystem `existsSync` is already false for a
      // wrong-case link, so the case diagnostic must be produced here too — not
      // only in the case-insensitive branch below — or it is unreachable on
      // Linux. A dangling symlink sits in the listing under its exact name and
      // stays a plain broken link.
      if (!existsSync(target)) {
        const name = basename(target);
        const entries = entriesOf(dirname(target));
        const actual = entries.has(name)
          ? undefined
          : [...entries].find((e) => e.toLowerCase() === name.toLowerCase());
        issues.push({
          file: page.repoPath,
          line: link.line,
          check: 'links-resolve',
          severity: 'error',
          message: actual
            ? `link case does not match the file on disk: ${link.href} (found ${actual})`
            : `broken link: ${link.href}`,
        });
        continue;
      }

      // Case-insensitive filesystems: `existsSync` is true even for a wrong-case
      // link; only the case-preserved directory listing can tell.
      const name = basename(target);
      const entries = entriesOf(dirname(target));
      if (!entries.has(name)) {
        const actual = [...entries].find((e) => e.toLowerCase() === name.toLowerCase());
        issues.push({
          file: page.repoPath,
          line: link.line,
          check: 'links-resolve',
          severity: 'error',
          message: actual
            ? `link case does not match the file on disk: ${link.href} (found ${actual})`
            : `broken link: ${link.href}`,
        });
      }
    }
  }

  return issues;
};
