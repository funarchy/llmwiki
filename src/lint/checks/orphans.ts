import { isConceptPage, pageDirectory } from '../../bundle/load.js';
import { isExternal, isRepoAbsolute } from '../../md/links.js';
import type { Check } from '../run.js';
import type { Issue, Page } from '../../types.js';

/**
 * The repo path a link points at, or null when it is not a page reference.
 *
 * Relative hrefs are resolved rather than skipped. A relative link violates check
 * 8's style rule, but it is still a link, and reachability is a property of the
 * link graph rather than of link style. Skipping them made check 5 report 208
 * phantom orphans on a real 210-page bundle that used the older relative
 * convention — one style difference cascading into hundreds of false findings.
 */
function targetOf(page: Page, href: string): string | null {
  if (href === '' || isExternal(href)) return null;
  if (isRepoAbsolute(href)) return href.slice(1);

  const dir = pageDirectory(page);
  const parts = dir === '' ? [] : dir.split('/');
  for (const segment of href.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return parts.join('/');
}

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
      const target = targetOf(page, link.href);
      if (target !== null && byPath.has(target)) queue.push(target);
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
