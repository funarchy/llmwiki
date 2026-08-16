import { describe, it, expect } from 'vitest';
import { stripCode, extractLinks, resolveRepoAbsolute } from '../../src/md/links.js';
import { join } from 'node:path';

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

  it('blanks a fence indented under a list item', () => {
    const input = ['- item', '  ```bash', '  [x]: /a.md', '  ```', 'after'].join('\n');
    const out = stripCode(input);
    expect(out.split('\n')).toHaveLength(5);
    expect(out).not.toContain('/a.md');
  });

  it('blanks a tilde fence', () => {
    const out = stripCode(['~~~', '[x]: /a.md', '~~~'].join('\n'));
    expect(out).not.toContain('/a.md');
  });
});

describe('extractLinks', () => {
  it('extracts reference definitions with line numbers offset by the body start', () => {
    const body = ['Text.', '', '[data]: /wiki/data/index.md'].join('\n');
    const links = extractLinks(body, 5);
    expect(links).toEqual([
      { ref: 'data', href: '/wiki/data/index.md', line: 7, style: 'reference-definition' },
    ]);
  });

  it('extracts inline links', () => {
    const links = extractLinks('See [child](/wiki/data/child.md) now.', 1);
    expect(links).toEqual([
      { href: '/wiki/data/child.md', line: 1, style: 'inline' },
    ]);
  });

  it('strips fragments from hrefs', () => {
    const links = extractLinks('[a]: /wiki/x.md#section', 1);
    expect(links[0].href).toBe('/wiki/x.md');
  });

  it('ignores links inside fenced code blocks', () => {
    const body = ['```markdown', '[a]: /wiki/x.md', '```'].join('\n');
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

  it('ignores links inside a fence indented under a list item', () => {
    const body = ['- item one', '  ```bash', '  See [x](/not/real.md)', '  ```', '- item two'].join('\n');
    expect(extractLinks(body, 1)).toEqual([]);
  });

  it('ignores links inside a tilde fence', () => {
    const body = ['~~~markdown', '[a]: /wiki/x.md', '~~~'].join('\n');
    expect(extractLinks(body, 1)).toEqual([]);
  });

  it('finds a reference definition indented up to three spaces', () => {
    const links = extractLinks('   [a]: /wiki/x.md', 1);
    expect(links).toEqual([
      { ref: 'a', href: '/wiki/x.md', line: 1, style: 'reference-definition' },
    ]);
  });

  it('treats an image as a link, so the reference-style rule covers it too', () => {
    const links = extractLinks('![diagram](/wiki/img/d.png)', 2);
    expect(links).toEqual([
      { href: '/wiki/img/d.png', line: 2, style: 'inline' },
    ]);
  });
});

describe('resolveRepoAbsolute', () => {
  it('resolves an href inside the repository root', () => {
    expect(resolveRepoAbsolute('/repo', '/wiki/x.md')).toBe(join('/repo', 'wiki', 'x.md'));
  });

  it('returns null for an href that climbs out of the repository root', () => {
    expect(resolveRepoAbsolute('/repo', '/../../etc/passwd')).toBeNull();
  });

  it('resolves interior traversal that stays inside the root', () => {
    expect(resolveRepoAbsolute('/repo', '/wiki/../wiki/x.md')).toBe(join('/repo', 'wiki', 'x.md'));
  });
});
