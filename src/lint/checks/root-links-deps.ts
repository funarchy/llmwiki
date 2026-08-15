import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Check } from '../run.js';
import type { Issue } from '../../types.js';

/**
 * When a generated tree exists (`deps/index.md` or `vendor/index.md`), the
 * root index must route agents to it. `install` only prints a reminder
 * (plan decision 6: it never edits user-authored files) — this check enforces
 * it.
 *
 * The root index page is already loaded with its links extracted
 * (`ctx.bundle.pages`), so membership is checked against parsed hrefs rather
 * than a raw substring match — a mention inside a code fence must not count
 * as a link (`extractLinks` never yields hrefs from fenced code).
 */
export const rootLinksDeps: Check = (ctx) => {
  const { repoRoot, config, bundle } = ctx;
  const root = config.bundle.root;
  const issues: Issue[] = [];
  const rootIndexPath = `${root}/index.md`;
  const rootPage = bundle.pages.find((p) => p.repoPath === rootIndexPath);
  const hrefs = new Set((rootPage?.links ?? []).map((l) => l.href));

  if (existsSync(join(repoRoot, root, 'deps', 'index.md')) && !hrefs.has(`/${root}/deps/index.md`)) {
    issues.push({
      file: rootIndexPath,
      check: 'root-links-deps',
      severity: 'error',
      message: `root index does not link to /${root}/deps/index.md — add a link so agents can reach dependency knowledge`,
    });
  }

  if (existsSync(join(repoRoot, root, 'vendor', 'index.md')) && !hrefs.has(`/${root}/vendor/index.md`)) {
    issues.push({
      file: rootIndexPath,
      check: 'root-links-deps',
      severity: 'error',
      message: `root index does not link to /${root}/vendor/index.md — add a link`,
    });
  }

  return issues;
};
