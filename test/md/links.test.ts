import { describe, it, expect } from 'vitest';
import { stripCode, extractLinks } from '../../src/md/links.js';

describe('stripCode', () => {
  it('blanks fenced blocks but preserves line count', () => {
    const input = ['before', '```', '[x]: /a.md', '```', 'after'].join('\n');
    const out = stripCode(input);
    expect(out.split('\n')).toHaveLength(5);
    expect(out).not.toContain('/a.md');
    expect(out).toContain('before');
    expect(out).toContain('after');
  });

  it('blanks inline code spans', () => {
    const out = stripCode('use `[x](/a.md)` here');
    expect(out).not.toContain('/a.md');
    expect(out).toHaveLength('use `[x](/a.md)` here'.length);
  });
});

describe('extractLinks', () => {
  it('extracts reference definitions with line numbers offset by the body start', () => {
    const body = ['Text.', '', '[data]: /llmwiki/data/index.md'].join('\n');
    const links = extractLinks(body, 5);
    expect(links).toEqual([
      { ref: 'data', href: '/llmwiki/data/index.md', line: 7, style: 'reference-definition' },
    ]);
  });

  it('extracts inline links', () => {
    const links = extractLinks('See [child](/llmwiki/data/child.md) now.', 1);
    expect(links).toEqual([
      { href: '/llmwiki/data/child.md', line: 1, style: 'inline' },
    ]);
  });

  it('strips fragments from hrefs', () => {
    const links = extractLinks('[a]: /llmwiki/x.md#section', 1);
    expect(links[0].href).toBe('/llmwiki/x.md');
  });

  it('ignores links inside fenced code blocks', () => {
    const body = ['```markdown', '[a]: /llmwiki/x.md', '```'].join('\n');
    expect(extractLinks(body, 1)).toEqual([]);
  });

  it('finds multiple inline links on one line', () => {
    const links = extractLinks('[a](/one.md) and [b](/two.md)', 3);
    expect(links.map((l) => l.href)).toEqual(['/one.md', '/two.md']);
    expect(links.every((l) => l.line === 3)).toBe(true);
  });

  it('returns an empty list for a body with no links', () => {
    expect(extractLinks('Just prose.\n', 1)).toEqual([]);
  });
});
