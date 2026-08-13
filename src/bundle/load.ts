import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { parseFrontmatter } from '../md/frontmatter.js';
import { extractLinks } from '../md/links.js';
import type { Bundle, Page } from '../types.js';

/** Directories inside a bundle that hold tooling, not pages. */
export const EXCLUDED_DIRS = new Set(['_meta']);

function toRepoPath(repoRoot: string, absPath: string): string {
  return relative(repoRoot, absPath).split(sep).join('/');
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (EXCLUDED_DIRS.has(entry)) continue;
      out.push(...walk(full));
    } else if (entry.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

export function loadBundle(repoRoot: string, root: string): Bundle {
  const absRoot = join(repoRoot, root);
  if (!existsSync(absRoot)) {
    throw new Error(`Bundle root not found: ${root} (looked in ${absRoot})`);
  }

  const pages: Page[] = walk(absRoot).map((absPath) => {
    const content = readFileSync(absPath, 'utf-8');
    const { frontmatter, state, body, bodyStartLine } = parseFrontmatter(content);
    return {
      absPath,
      repoPath: toRepoPath(repoRoot, absPath),
      isIndex: basename(absPath) === 'index.md',
      frontmatter,
      frontmatterState: state,
      body,
      links: extractLinks(body, bodyStartLine),
    };
  });

  return { absRoot, root, pages };
}

/** True when a page must satisfy the concept-page checks. */
export function isConceptPage(page: Page, bundle: Bundle): boolean {
  if (page.isIndex) return false;
  if (page.repoPath === `${bundle.root}/README.md`) return false;
  return true;
}

/** Every directory that contains at least one loaded page, as repo-relative paths. */
export function pageDirectories(bundle: Bundle): string[] {
  const dirs = new Set<string>();
  for (const page of bundle.pages) {
    dirs.add(page.repoPath.split('/').slice(0, -1).join('/'));
  }
  return [...dirs].sort();
}
