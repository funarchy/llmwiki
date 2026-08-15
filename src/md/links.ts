import { resolve, sep } from 'node:path';
import type { Link } from '../types.js';

const BACKTICK_FENCE_RE = /^[ \t]*```[\s\S]*?^[ \t]*```/gm;
const TILDE_FENCE_RE = /^[ \t]*~~~[\s\S]*?^[ \t]*~~~/gm;
const INLINE_CODE_RE = /`{1,2}[^`\n]*`{1,2}/g;
const INLINE_LINK_RE = /\[([^\]]*)\]\(\s*([^)\s]+)/g;
const REF_DEF_RE = /^ {0,3}\[([^\]]+)\]:\s*(\S+)/;

/** Blank out code so example links are never treated as real, preserving line count. */
export function stripCode(text: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return text
    .replace(BACKTICK_FENCE_RE, blank)
    .replace(TILDE_FENCE_RE, blank)
    .replace(INLINE_CODE_RE, blank);
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

/**
 * Resolve a repo-root-absolute href to an absolute path on disk, or null when it
 * escapes the repository root.
 *
 * The null case is a correctness matter, not just a safety one: `/../../etc/passwd`
 * resolves to a real file on the host, so a naive join + existsSync would report it
 * as a perfectly good link. It is not — there is no such path in the repository.
 */
export function resolveRepoAbsolute(repoRoot: string, href: string): string | null {
  const root = resolve(repoRoot);
  const target = resolve(root, href.slice(1));
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}
