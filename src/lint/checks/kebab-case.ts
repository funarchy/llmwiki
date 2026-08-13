import { basename } from 'node:path';
import { isConceptPage } from '../../bundle/load.js';
import type { Check } from '../run.js';
import type { Issue } from '../../types.js';

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*\.md$/;

export const kebabCase: Check = (ctx) => {
  const issues: Issue[] = [];
  for (const page of ctx.bundle.pages) {
    if (!isConceptPage(page, ctx.bundle)) continue;
    const name = basename(page.repoPath);
    if (!KEBAB_CASE.test(name)) {
      issues.push({
        file: page.repoPath,
        check: 'kebab-case',
        severity: 'error',
        message: `filename is not kebab-case: ${name}`,
      });
    }
  }
  return issues;
};
