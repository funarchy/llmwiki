import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../../src/md/frontmatter.js';

describe('parseFrontmatter', () => {
  it('returns null frontmatter when the file does not open with a delimiter', () => {
    const result = parseFrontmatter('# Title\n\nBody text.\n');
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe('# Title\n\nBody text.\n');
    expect(result.bodyStartLine).toBe(1);
  });

  it('parses frontmatter and reports where the body starts', () => {
    const content = ['---', 'type: topic', 'title: Mongo', '---', '', 'Body.', ''].join('\n');
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toEqual({ type: 'topic', title: 'Mongo' });
    expect(result.body).toBe('\nBody.\n');
    expect(result.bodyStartLine).toBe(5);
  });

  it('treats an unterminated frontmatter block as no frontmatter', () => {
    const result = parseFrontmatter('---\ntype: topic\n\nBody.\n');
    expect(result.frontmatter).toBeNull();
    expect(result.bodyStartLine).toBe(1);
  });

  it('treats unparseable YAML as no frontmatter', () => {
    const content = ['---', 'type: [unclosed', '---', '', 'Body.'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toBeNull();
  });

  it('treats an empty frontmatter block as no frontmatter', () => {
    const content = ['---', '---', '', 'Body.'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toBeNull();
    expect(result.bodyStartLine).toBe(3);
  });

  it('parses a list value', () => {
    const content = ['---', 'sources:', '  - src/a.ts', '  - src/b.ts', '---', 'Body.'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.frontmatter?.sources).toEqual(['src/a.ts', 'src/b.ts']);
  });
});
