import { parse } from 'yaml';
import type { Frontmatter } from '../types.js';

export interface ParsedFile {
  frontmatter: Frontmatter | null;
  body: string;
  /** 1-based line number where the body begins. */
  bodyStartLine: number;
}

const DELIM = '---';

export function parseFrontmatter(content: string): ParsedFile {
  const lines = content.split('\n');

  if (lines[0]?.trim() !== DELIM) {
    return { frontmatter: null, body: content, bodyStartLine: 1 };
  }

  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === DELIM) {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) {
    return { frontmatter: null, body: content, bodyStartLine: 1 };
  }

  const yamlText = lines.slice(1, closeIdx).join('\n');
  const body = lines.slice(closeIdx + 1).join('\n');
  const bodyStartLine = closeIdx + 2;

  let frontmatter: Frontmatter | null = null;
  try {
    const loaded = parse(yamlText) as unknown;
    if (loaded !== null && typeof loaded === 'object' && !Array.isArray(loaded)) {
      frontmatter = loaded as Frontmatter;
    }
  } catch {
    frontmatter = null;
  }

  return { frontmatter, body, bodyStartLine };
}
