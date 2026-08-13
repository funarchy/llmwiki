import { isExternal, isRepoAbsolute } from '../../md/links.js';
import { parseGitHubSlug } from '../../git.js';
import type { Check } from '../run.js';
import type { Issue } from '../../types.js';

export const linkAbsolute: Check = (ctx) => {
  const issues: Issue[] = [];
  const ownSlug = parseGitHubSlug(ctx.gitRemote);

  for (const page of ctx.bundle.pages) {
    for (const link of page.links) {
      if (link.href === '') continue;

      if (isExternal(link.href)) {
        if (ownSlug) {
          const match = /^https?:\/\/github\.com\/([^/]+\/[^/]+)\/(?:blob|tree|raw)\//.exec(link.href);
          if (match && match[1] === ownSlug) {
            issues.push({
              file: page.repoPath,
              line: link.line,
              check: 'link-absolute',
              severity: 'error',
              message: `GitHub URL points at the same repository — use a repo-root-absolute path instead: ${link.href}`,
            });
          }
        }
        continue;
      }

      if (!isRepoAbsolute(link.href)) {
        issues.push({
          file: page.repoPath,
          line: link.line,
          check: 'link-absolute',
          severity: 'error',
          message: `link \`${link.href}\` must be repo-root-absolute, e.g. /${ctx.bundle.root}/path/page.md`,
        });
      }
    }
  }

  return issues;
};
