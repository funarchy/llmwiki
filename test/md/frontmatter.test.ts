import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../../src/md/frontmatter.js';

describe('parseFrontmatter', () => {
  it('reports absent when the file does not open with a delimiter', () => {
    const result = parseFrontmatter('# Title\n\nBody text.\n');
    expect(result.state).toBe('absent');
    expect(result.frontmatter).toBeNull();
    expect(result.body).toBe('# Title\n\nBody text.\n');
    expect(result.bodyStartLine).toBe(1);
  });

  it('parses frontmatter and reports where the body starts', () => {
    const content = ['---', 'type: topic', 'title: Mongo', '---', '', 'Body.', ''].join('\n');
    const result = parseFrontmatter(content);
    expect(result.state).toBe('parsed');
    expect(result.frontmatter).toEqual({ type: 'topic', title: 'Mongo' });
    expect(result.body).toBe('\nBody.\n');
    expect(result.bodyStartLine).toBe(5);
  });

  it('reports absent for an unterminated frontmatter block', () => {
    const result = parseFrontmatter('---\ntype: topic\n\nBody.\n');
    expect(result.state).toBe('absent');
    expect(result.frontmatter).toBeNull();
    expect(result.bodyStartLine).toBe(1);
  });

  it('reports invalid for a block whose YAML will not parse', () => {
    const content = ['---', 'type: [unclosed', '---', '', 'Body.'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.state).toBe('invalid');
    expect(result.frontmatter).toBeNull();
    expect(result.bodyStartLine).toBe(4);
  });

  it('reports invalid for a block that parses to something other than a mapping', () => {
    const content = ['---', '- a', '- b', '---', '', 'Body.'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.state).toBe('invalid');
    expect(result.frontmatter).toBeNull();
  });

  it('reports empty for a block that holds nothing', () => {
    const content = ['---', '---', '', 'Body.'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.state).toBe('empty');
    expect(result.frontmatter).toBeNull();
    expect(result.bodyStartLine).toBe(3);
  });

  it('parses a list value', () => {
    const content = ['---', 'sources:', '  - src/a.ts', '  - src/b.ts', '---', 'Body.'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.frontmatter?.sources).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('does not leak a carriage return into the last frontmatter value on a CRLF file', () => {
    const content = '---\r\ntype: topic\r\ntitle: Mongo\r\n---\r\n\r\nBody.\r\n';
    const result = parseFrontmatter(content);
    expect(result.state).toBe('parsed');
    expect(result.frontmatter).toEqual({ type: 'topic', title: 'Mongo' });
    expect(result.body).toBe('\nBody.\n');
    expect(result.bodyStartLine).toBe(5);
  });
});
