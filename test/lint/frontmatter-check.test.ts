import { describe, it, expect } from 'vitest';
import { frontmatterCheck } from '../../src/lint/checks/frontmatter.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';
import { contextFor } from '../helpers/lint.js';

const base = { 'llmwiki.yaml': configYaml(), 'llmwiki/index.md': '# Root\n' };

describe('check: frontmatter', () => {
  it('accepts a conformant concept page', () => {
    const root = makeRepo({ ...base, 'llmwiki/mongo.md': page('Mongo') });
    expect(frontmatterCheck(contextFor(root))).toEqual([]);
  });

  it('flags a page with no frontmatter', () => {
    const root = makeRepo({ ...base, 'llmwiki/mongo.md': '# Mongo\n\nBody.\n' });
    const issues = frontmatterCheck(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/missing frontmatter/);
  });

  it('flags a page whose frontmatter block will not parse, distinctly from absent', () => {
    const root = makeRepo({ ...base, 'llmwiki/mongo.md': '---\ntitle: [unclosed\n---\n\nBody.\n' });
    const issues = frontmatterCheck(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/not a parseable mapping/);
  });

  it('flags each missing required field', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': ['---', 'type: topic', '---', '', 'Body.'].join('\n'),
    });
    const messages = frontmatterCheck(contextFor(root)).map((i) => i.message);
    expect(messages.join(' ')).toMatch(/title/);
    expect(messages.join(' ')).toMatch(/description/);
    expect(messages.join(' ')).toMatch(/sources/);
  });

  it('reports missing required fields for an empty frontmatter block', () => {
    const root = makeRepo({ ...base, 'llmwiki/mongo.md': '---\n---\n\nBody.\n' });
    const messages = frontmatterCheck(contextFor(root)).map((i) => i.message);
    expect(messages.join(' ')).toMatch(/type/);
    expect(messages.join(' ')).toMatch(/title/);
  });

  it('flags an invalid type', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': [
        '---',
        'type: guide',
        'title: Mongo',
        'description: A description long enough to pass',
        'sources:',
        '  - src/a.ts',
        '---',
        '',
        'Body.',
      ].join('\n'),
    });
    const issues = frontmatterCheck(contextFor(root));
    expect(issues.map((i) => i.message).join(' ')).toMatch(/topic, meta/);
  });

  it('flags an empty sources array', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': [
        '---',
        'type: topic',
        'title: Mongo',
        'description: A description long enough to pass',
        'sources: []',
        '---',
        '',
        'Body.',
      ].join('\n'),
    });
    expect(frontmatterCheck(contextFor(root)).map((i) => i.message).join(' ')).toMatch(/sources/);
  });

  it('flags a description shorter than 10 characters', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': [
        '---',
        'type: topic',
        'title: Mongo',
        'description: short',
        'sources:',
        '  - src/a.ts',
        '---',
        '',
        'Body.',
      ].join('\n'),
    });
    expect(frontmatterCheck(contextFor(root)).map((i) => i.message).join(' ')).toMatch(/description/);
  });

  it('tolerates unknown producer keys', () => {
    const root = makeRepo({
      ...base,
      'llmwiki/mongo.md': [
        '---',
        'type: topic',
        'title: Mongo',
        'description: A description long enough to pass',
        'sources:',
        '  - src/a.ts',
        'producer_field: anything',
        '---',
        '',
        'Body.',
      ].join('\n'),
    });
    expect(frontmatterCheck(contextFor(root))).toEqual([]);
  });

  it('skips index files and the bundle README', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/README.md': '# Readme\n',
    });
    expect(frontmatterCheck(contextFor(root))).toEqual([]);
  });
});
