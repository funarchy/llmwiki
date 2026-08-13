import { describe, it, expect } from 'vitest';
import { collectGaps, formatGaps } from '../../src/commands/gaps.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';

const evalCase = (question: string, status: string, pagesNeeded?: string[]) =>
  [
    '---',
    `question: "${question}"`,
    'added: 2026-08-13',
    `status: ${status}`,
    ...(pagesNeeded ? ['pages-needed:', ...pagesNeeded.map((p) => `  - ${p}`)] : []),
    '---',
    '',
    '## Current wiki answer',
    '',
    'Nothing yet.',
  ].join('\n');

describe('collectGaps', () => {
  it('collects to_resolve eval cases with their pages-needed', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/_meta/eval/index.md': '# Eval\n',
      'llmwiki/_meta/eval/add-a-drill.md': evalCase('How do I add a drill?', 'to_resolve', [
        'llmwiki/drills/add-drill.md — how to add a drill',
      ]),
      'llmwiki/_meta/eval/what-is-pms.md': evalCase('What is PMS?', 'satisfied'),
    });
    const gaps = collectGaps(root, 'llmwiki');
    expect(gaps.evalGaps).toHaveLength(1);
    expect(gaps.evalGaps[0].question).toBe('How do I add a drill?');
    expect(gaps.evalGaps[0].pagesNeeded).toEqual(['llmwiki/drills/add-drill.md — how to add a drill']);
  });

  it('collects stub pages', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Mongo](/llmwiki/mongo.md) - mongo\n',
      'llmwiki/mongo.md': page('Mongo', '\n**Stub.** Needs writing.\n'),
    });
    const gaps = collectGaps(root, 'llmwiki');
    expect(gaps.stubs).toEqual([{ title: 'Mongo', repoPath: 'llmwiki/mongo.md' }]);
  });

  it('returns empty collections when there is nothing to report', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
    });
    const gaps = collectGaps(root, 'llmwiki');
    expect(gaps.evalGaps).toEqual([]);
    expect(gaps.stubs).toEqual([]);
  });

  it('tolerates a missing _meta/eval directory', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
    });
    expect(() => collectGaps(root, 'llmwiki')).not.toThrow();
  });

  it('skips an eval case whose frontmatter cannot be parsed', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/_meta/eval/broken.md': '---\nquestion: [unclosed\n---\n',
    });
    expect(collectGaps(root, 'llmwiki').evalGaps).toEqual([]);
  });

  it('does not treat a stub marker inside a code fence as a stub', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n\n* [Mongo](/llmwiki/mongo.md) - mongo\n',
      'llmwiki/mongo.md': page('Mongo', '\n```\n**Stub.** example\n```\n'),
    });
    expect(collectGaps(root, 'llmwiki').stubs).toEqual([]);
  });

  it('skips a directory in _meta/eval whose name ends in .md instead of throwing EISDIR', () => {
    const root = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Root\n',
      'llmwiki/_meta/eval/weird.md/inner.md': 'not an eval case',
      'llmwiki/_meta/eval/real.md': evalCase('Real question?', 'to_resolve'),
    });
    const gaps = collectGaps(root, 'llmwiki');
    expect(gaps.evalGaps).toEqual([{ question: 'Real question?', pagesNeeded: [] }]);
  });
});

describe('formatGaps', () => {
  it('prints "(none)" for empty sections', () => {
    const out = formatGaps({ evalGaps: [], stubs: [] });
    expect(out).toMatch(/## Open gaps\n\n\(none\)/);
    expect(out).toMatch(/## Wiki pages that need content\n\n\(none\)/);
  });

  it('lists questions with their needed pages', () => {
    const out = formatGaps({
      evalGaps: [{ question: 'How do I add a drill?', pagesNeeded: ['llmwiki/a.md — a page'] }],
      stubs: [{ title: 'Mongo', repoPath: 'llmwiki/mongo.md' }],
    });
    expect(out).toContain('1. How do I add a drill?');
    expect(out).toContain('llmwiki/a.md — a page');
    expect(out).toContain('Mongo - llmwiki/mongo.md');
  });

  it('notes when a gap needs no new pages', () => {
    const out = formatGaps({ evalGaps: [{ question: 'Q?', pagesNeeded: [] }], stubs: [] });
    expect(out).toMatch(/no new pages needed/);
  });

  it('collapses whitespace in a question when rendering', () => {
    const out = formatGaps({
      evalGaps: [{ question: 'How do I\n  add a drill?', pagesNeeded: [] }],
      stubs: [],
    });
    expect(out).toContain('1. How do I add a drill?');
    expect(out).not.toMatch(/add\s{2,}a/);
  });
});
