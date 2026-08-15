import { isConceptPage } from '../../bundle/load.js';
import type { Check } from '../run.js';
import type { Issue } from '../../types.js';

export const linkReferenceStyle: Check = (ctx) => {
  const issues: Issue[] = [];

  for (const page of ctx.bundle.pages) {
    if (!isConceptPage(page, ctx.bundle)) continue;

    for (const link of page.links) {
      if (link.style !== 'inline') continue;
      issues.push({
        file: page.repoPath,
        line: link.line,
        check: 'link-reference-style',
        severity: 'error',
        message: `inline link or image \`${link.href}\` — use a reference definition in the page footer instead`,
      });
    }
  }

  return issues;
};
