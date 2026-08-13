import { join } from 'node:path';
import type { Link } from '../types.js';

const FENCE_RE = /^```[\s\S]*?^```/gm;
const INLINE_CODE_RE = /`{1,2}[^`\n]*`{1,2}/g;
const INLINE_LINK_RE = /\[([^\]]*)\]\(\s*([^)\s]+)/g;
const REF_DEF_RE = /^\[([^\]]+)\]:\s*(\S+)/;

/** Blank out code so example links are never treated as real, preserving line count. */
export function stripCode(text: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return text.replace(FENCE_RE, blank).replace(INLINE_CODE_RE, blank);
}

function stripFragment(href: string): string {
  const i = href.indexOf('#');
  return i === -1 ? href : href.slice(0, i);
}

/**
 * Extract every link in a page body.
 * @param bodyStartLine 1-based line number of the body's first line in the file.
 */
export function extractLinks(body: string, bodyStartLine: number): Link[] {
  const lines = stripCode(body).split('\n');
  const links: Link[] = [];

  lines.forEach((line, i) => {
    const lineNo = bodyStartLine + i;

    const def = REF_DEF_RE.exec(line);
    if (def) {
      links.push({
        ref: def[1],
        href: stripFragment(def[2]),
        line: lineNo,
        style: 'reference-definition',
      });
      return;
    }

    INLINE_LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = INLINE_LINK_RE.exec(line)) !== null) {
      links.push({ href: stripFragment(m[2]), line: lineNo, style: 'inline' });
    }
  });

  return links;
}

/** True for `https://`, `mailto:`, `mongo://` and any other scheme-qualified href. */
export function isExternal(href: string): boolean {
  return /^([a-z][a-z0-9+.-]*:\/\/|mailto:|tel:)/i.test(href);
}

/** True for a repo-root-absolute href, the only form allowed in a body (§3.3). */
export function isRepoAbsolute(href: string): boolean {
  return href.startsWith('/');
}

/** Resolve a repo-root-absolute href to an absolute path on disk. */
export function resolveRepoAbsolute(repoRoot: string, href: string): string {
  return join(repoRoot, href.slice(1));
}
