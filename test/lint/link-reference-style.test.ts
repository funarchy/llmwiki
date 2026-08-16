import { describe, it, expect } from 'vitest';
import { linkReferenceStyle } from '../../src/lint/checks/link-reference-style.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';
import { contextFor } from '../helpers/lint.js';

const base = { 'wiki-sticky.yaml': configYaml(), 'wiki/index.md': '# Root\n' };

describe('check: link-reference-style', () => {
  it('accepts reference-style links in a concept page', () => {
    const root = makeRepo({
      ...base,
      'wiki/mongo.md': page('Mongo', '\nSee [data][data].\n\n[data]: /wiki/index.md\n'),
    });
    expect(linkReferenceStyle(contextFor(root))).toEqual([]);
  });

  it('flags an inline link in a concept page', () => {
    const root = makeRepo({
      ...base,
      'wiki/mongo.md': page('Mongo', '\nSee [data](/wiki/index.md).\n'),
    });
    const issues = linkReferenceStyle(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].check).toBe('link-reference-style');
    expect(issues[0].line).toBeGreaterThan(0);
  });

  it('allows inline links in index files', () => {
    const root = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n\n* [Mongo](/wiki/mongo.md) - mongo\n',
      'wiki/mongo.md': page('Mongo'),
    });
    expect(linkReferenceStyle(contextFor(root))).toEqual([]);
  });

  it('does not flag inline links inside code fences', () => {
    const root = makeRepo({
      ...base,
      'wiki/mongo.md': page('Mongo', '\n```markdown\n[x](/wiki/index.md)\n```\n'),
    });
    expect(linkReferenceStyle(contextFor(root))).toEqual([]);
  });

  it('flags an inline image, because images are links too', () => {
    const root = makeRepo({
      ...base,
      'wiki/mongo.md': page('Mongo', '\n![diagram](/wiki/img/d.png)\n'),
    });
    expect(linkReferenceStyle(contextFor(root))).toHaveLength(1);
  });

  it('flags every inline link on a line, not just the first', () => {
    const root = makeRepo({
      ...base,
      'wiki/mongo.md': page('Mongo', '\nSee [a](/wiki/index.md) and [b](/wiki/index.md).\n'),
    });
    expect(linkReferenceStyle(contextFor(root))).toHaveLength(2);
  });

  it('skips the bundle README', () => {
    const root = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
      'wiki/README.md': '# Readme\n\nSee [x](/wiki/index.md).\n',
    });
    expect(linkReferenceStyle(contextFor(root))).toEqual([]);
  });
});
