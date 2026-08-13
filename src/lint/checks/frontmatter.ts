import { isConceptPage } from '../../bundle/load.js';
import { compileSchema, describeError, substantiveErrors } from '../../schema.js';
import type { Check } from '../run.js';
import type { Issue } from '../../types.js';

export const frontmatterCheck: Check = (ctx) => {
  const issues: Issue[] = [];
  const validate = compileSchema('page.schema.json');

  for (const page of ctx.bundle.pages) {
    if (!isConceptPage(page, ctx.bundle)) continue;

    if (page.frontmatterState === 'absent') {
      issues.push({
        file: page.repoPath,
        check: 'frontmatter',
        severity: 'error',
        message: 'missing frontmatter',
      });
      continue;
    }

    if (page.frontmatterState === 'invalid') {
      issues.push({
        file: page.repoPath,
        check: 'frontmatter',
        severity: 'error',
        message: 'frontmatter block present, but its YAML is not a parseable mapping',
      });
      continue;
    }

    // An `empty` block validates as {}, which reports each missing required field.
    if (!validate(page.frontmatter ?? {})) {
      // Read errors immediately: the memoized validator is stateful.
      // Filtered through the single owner so a future union in the page schema
      // cannot flood the report with per-branch structural noise.
      for (const error of substantiveErrors(validate.errors)) {
        issues.push({
          file: page.repoPath,
          check: 'frontmatter',
          severity: 'error',
          message: describeError(error),
        });
      }
    }
  }

  return issues;
};
