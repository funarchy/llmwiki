import type { Check } from '../run.js';
import type { Issue } from '../../types.js';

export const indexFrontmatter: Check = (ctx) => {
  const issues: Issue[] = [];
  const rootIndex = `${ctx.bundle.root}/index.md`;

  for (const page of ctx.bundle.pages) {
    if (!page.isIndex) continue;
    // No delimited block at all is the correct state for an index file.
    if (page.frontmatterState === 'absent') continue;

    if (page.frontmatterState === 'invalid') {
      issues.push({
        file: page.repoPath,
        check: 'index-frontmatter',
        severity: 'error',
        message:
          'index.md has a frontmatter block whose YAML is not a parseable mapping — index files must have none at all',
      });
      continue;
    }

    if (page.repoPath !== rootIndex) {
      issues.push({
        file: page.repoPath,
        check: 'index-frontmatter',
        severity: 'error',
        message: 'index.md must not have frontmatter — it is a directory router, not a concept page',
      });
      continue;
    }

    const unexpected = Object.keys(page.frontmatter ?? {}).filter((k) => k !== 'okf_version');
    if (unexpected.length > 0) {
      issues.push({
        file: page.repoPath,
        check: 'index-frontmatter',
        severity: 'error',
        message: `bundle-root index.md may only declare okf_version; found: ${unexpected.join(', ')}`,
      });
    }
  }

  return issues;
};
