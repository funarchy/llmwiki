import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Check } from '../run.js';
import type { Issue } from '../../types.js';

/**
 * When a generated tree exists (`deps/index.md` or `vendor/index.md`), the
 * root index must route agents to it. `install` only prints a reminder
 * (plan decision 6: it never edits user-authored files) — this check enforces
 * it.
 */
export const rootLinksDeps: Check = (ctx) => {
  const { repoRoot, config } = ctx;
  const root = config.bundle.root;
  const issues: Issue[] = [];
  const rootIndexPath = join(repoRoot, root, 'index.md');
  const body = existsSync(rootIndexPath) ? readFileSync(rootIndexPath, 'utf-8') : '';

  if (existsSync(join(repoRoot, root, 'deps', 'index.md')) && !body.includes(`/${root}/deps/index.md`)) {
    issues.push({
      file: `${root}/index.md`,
      check: 'root-links-deps',
      severity: 'error',
      message: `root index does not link to /${root}/deps/index.md — add a link so agents can reach dependency knowledge`,
    });
  }

  if (existsSync(join(repoRoot, root, 'vendor', 'index.md')) && !body.includes(`/${root}/vendor/index.md`)) {
    issues.push({
      file: `${root}/index.md`,
      check: 'root-links-deps',
      severity: 'error',
      message: `root index does not link to /${root}/vendor/index.md — add a link`,
    });
  }

  return issues;
};
