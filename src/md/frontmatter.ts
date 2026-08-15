import { parse } from 'yaml';
import type { Frontmatter, FrontmatterState } from '../types.js';

export interface ParsedFile {
  /** The parsed mapping. Null unless `state` is `parsed`. */
  frontmatter: Frontmatter | null;
  state: FrontmatterState;
  body: string;
  /** 1-based line number where the body begins. */
  bodyStartLine: number;
}

const DELIM = '---';

export function parseFrontmatter(content: string): ParsedFile {
  // Normalize to LF first: otherwise the last frontmatter line keeps an orphan
  // `\r`, which YAML 1.2 treats as scalar content rather than a line break.
  // Line count is unchanged, so `bodyStartLine` still indexes the real file.
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  const absent: ParsedFile = {
    frontmatter: null,
    state: 'absent',
    body: normalized,
    bodyStartLine: 1,
  };

  // `.trim()` rather than `===` so a leading BOM or trailing space still matches.
  if (lines[0]?.trim() !== DELIM) return absent;

  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === DELIM) {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) return absent;

  const body = lines.slice(closeIdx + 1).join('\n');
  const bodyStartLine = closeIdx + 2;

  let loaded: unknown;
  try {
    loaded = parse(lines.slice(1, closeIdx).join('\n'));
  } catch {
    return { frontmatter: null, state: 'invalid', body, bodyStartLine };
  }

  if (loaded === null || loaded === undefined) {
    return { frontmatter: null, state: 'empty', body, bodyStartLine };
  }
  if (typeof loaded !== 'object' || Array.isArray(loaded)) {
    return { frontmatter: null, state: 'invalid', body, bodyStartLine };
  }
  return { frontmatter: loaded as Frontmatter, state: 'parsed', body, bodyStartLine };
}
