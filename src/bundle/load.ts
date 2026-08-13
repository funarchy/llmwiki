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

    let isDir: boolean;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      // A dangling symlink. `mode: link` vendoring (§7.2) makes symlinks inside a
      // bundle a designed feature, so one orphaned by a pruned `node_modules` is an
      // ordinary accident — and a linter must always terminate with a report, never
      // a stack trace. Treat it as absent from the model; check 4 still flags any
      // page that links to the missing target, because `existsSync` returns false
      // for a dangling symlink.
      continue;
    }

    if (isDir) {
      if (EXCLUDED_DIRS.has(entry)) continue;
      out.push(...walk(full));
    } else if (entry.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Walk a bundle root into the in-memory model every lint check consumes.
 *
 * Precondition: `root` is already validated. `loadConfig` clamps it to stay inside
 * the repository; a caller bypassing `loadConfig` inherits that responsibility.
 */
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

/** The directory a page sits in, as a repo-relative path. */
export function pageDirectory(page: Page): string {
  return page.repoPath.split('/').slice(0, -1).join('/');
}

/** Every directory that contains at least one loaded page, as repo-relative paths. */
export function pageDirectories(bundle: Bundle): string[] {
  return [...new Set(bundle.pages.map(pageDirectory))].sort();
}
