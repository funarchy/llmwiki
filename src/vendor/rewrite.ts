import { stripCode } from '../md/links.js';

export interface RewriteOptions {
  /** The producer's bundle root name, e.g. 'wiki'. */
  producerRoot: string;
  /** The consumer's bundle root name, e.g. 'llmwiki'. */
  consumerRoot: string;
  /** The bundle's name in the consumer's deps/, e.g. '@funarchy/scenepad'. */
  bundleName: string;
}

export interface RewriteResult {
  content: string;
  warnings: string[];
}

const REF_DEF_RE = /^ {0,3}\[[^\]]+\]:\s*(\S+)/;
const INLINE_LINK_RE = /\[[^\]]*\]\(\s*([^)\s]+)/g;

/**
 * Retarget every absolute href in a vendored page (§7.4). A prefix
 * substitution, identical for every page at any depth — and a no-op when
 * producer and consumer roots match and the page has no cross-bundle links.
 *
 * Matching happens on the stripCode-blanked copy, whose blanking preserves
 * offsets, and edits are applied to the original at those exact offsets —
 * so hrefs inside code fences are never touched. Covers reference
 * definitions AND inline links: producers' index files use inline absolute
 * links by design (§3.2) and are vendored too.
 */
export function rewritePage(content: string, opts: RewriteOptions): RewriteResult {
  const warnings: string[] = [];
  const normalized = content.replace(/\r\n/g, '\n');
  const originalLines = normalized.split('\n');
  const strippedLines = stripCode(normalized).split('\n');

  const mapHref = (href: string): string | null => {
    const [path, frag] = splitFragment(href);
    if (!path.startsWith('/')) return null;
    const producerPrefix = `/${opts.producerRoot}`;
    if (path === producerPrefix || path.startsWith(`${producerPrefix}/`)) {
      const rest = path.slice(producerPrefix.length); // '' or '/…'
      if (rest.startsWith('/vendor/')) {
        warnings.push(`link into the producer's vendor/ is not vendored and will dangle: ${href}`);
        return null;
      }
      const mapped = rest.startsWith('/deps/')
        ? `/${opts.consumerRoot}/deps${rest.slice('/deps'.length)}` // flat hoist
        : `/${opts.consumerRoot}/deps/${opts.bundleName}${rest}`; // producer's own page
      return mapped + frag;
    }
    warnings.push(`link outside the producer's bundle root cannot be resolved by the consumer: ${href}`);
    return null;
  };

  const rewritten = originalLines.map((line, i) => {
    const stripped = strippedLines[i];
    const edits: Array<{ start: number; end: number; text: string }> = [];

    const refMatch = REF_DEF_RE.exec(stripped);
    if (refMatch) {
      const href = refMatch[1];
      const start = refMatch[0].length - href.length + refMatch.index;
      collect(edits, href, start);
    } else {
      INLINE_LINK_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = INLINE_LINK_RE.exec(stripped)) !== null) {
        const href = m[1];
        collect(edits, href, m.index + m[0].length - href.length);
      }
    }

    let result = line;
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    }
    return result;

    function collect(list: typeof edits, href: string, start: number) {
      const mapped = mapHref(href);
      if (mapped !== null && mapped !== href) list.push({ start, end: start + href.length, text: mapped });
    }
  });

  return { content: rewritten.join('\n'), warnings };
}

function splitFragment(href: string): [string, string] {
  const i = href.indexOf('#');
  return i === -1 ? [href, ''] : [href.slice(0, i), href.slice(i)];
}
