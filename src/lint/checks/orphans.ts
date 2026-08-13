import { isConceptPage } from '../../bundle/load.js';
import { isExternal, isRepoAbsolute } from '../../md/links.js';
import type { Check } from '../run.js';
import type { Issue, Page } from '../../types.js';

/** Repo paths reachable by walking index files from the bundle root index. */
function reachable(pages: Page[], rootIndexPath: string): Set<string> {
  const byPath = new Map(pages.map((p) => [p.repoPath, p]));
  const seen = new Set<string>();
  const queue: string[] = [rootIndexPath];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);

    const page = byPath.get(current);
    // Only routers propagate reachability.
    if (!page?.isIndex) continue;

    for (const link of page.links) {
      if (link.href === '' || isExternal(link.href) || !isRepoAbsolute(link.href)) continue;
      const target = link.href.slice(1);
      if (byPath.has(target)) queue.push(target);
    }
  }

  return seen;
}

export const orphans: Check = (ctx) => {
  const issues: Issue[] = [];
  const rootIndexPath = `${ctx.bundle.root}/index.md`;
  const reached = reachable(ctx.bundle.pages, rootIndexPath);

  for (const page of ctx.bundle.pages) {
    if (page.repoPath === rootIndexPath) continue;
    if (!page.isIndex && !isConceptPage(page, ctx.bundle)) continue;
    if (reached.has(page.repoPath)) continue;

    issues.push({
      file: page.repoPath,
      check: 'orphans',
      severity: 'error',
      message: 'orphan — not reachable by following index.md links from the bundle root',
    });
  }

  return issues;
};
