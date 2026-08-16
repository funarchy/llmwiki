import { describe, it, expect } from 'vitest';
import { runLint, formatIssues, exitCodeFor, CHECKS } from '../../src/lint/run.js';
import '../../src/lint/checks/index.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';
import { contextFor } from '../helpers/lint.js';

describe('runLint', () => {
  it('registers all twelve checks in report order', () => {
    expect(CHECKS.map((c) => c.id)).toEqual([
      'kebab-case',
      'frontmatter',
      'index-frontmatter',
      'links-resolve',
      'orphans',
      'dir-index',
      'link-reference-style',
      'link-absolute',
      'vendored-lock',
      'generated-indexes',
      'root-links-deps',
      'skills-current',
    ]);
  });

  it('returns no issues for a conformant bundle', () => {
    const root = makeRepo({
      // skills: off — this fixture is about bundle-content conformance, not
      // skills sync state; check 12 would otherwise warn for five unlocked
      // shipped skills this fixture never installed.
      'wiki-sticky.yaml': 'version: 1\nbundle:\n  root: wiki\nskills: off\n',
      'wiki/index.md': "---\nokf_version: '0.2'\n---\n\n# Root\n\n* [Data](/wiki/data/index.md) - data\n",
      'wiki/data/index.md': '# Data\n\n* [Mongo](/wiki/data/mongo.md) - mongo\n',
      'wiki/data/mongo.md': page('Mongo'),
    });
    const issues = runLint(contextFor(root));
    expect(issues).toEqual([]);
    expect(formatIssues(issues)).toMatch(/no issues/);
    expect(exitCodeFor(issues)).toBe(0);
  });

  it('collects issues from multiple checks at once', () => {
    const root = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
      'wiki/badName.md': '# No frontmatter\n\nSee [x](./nope.md).\n',
    });
    const issues = runLint(contextFor(root));
    const checks = new Set(issues.map((i) => i.check));
    expect(checks).toContain('kebab-case');
    expect(checks).toContain('frontmatter');
    expect(checks).toContain('orphans');
    expect(checks).toContain('link-absolute');
    expect(exitCodeFor(issues)).toBe(1);
  });

  it('exits 0 when only warnings are present', () => {
    expect(exitCodeFor([{ file: 'a.md', check: 'x', severity: 'warning', message: 'm' }])).toBe(0);
  });

  it('formats an issue with and without a line number', () => {
    const output = formatIssues([
      { file: 'a.md', check: 'x', severity: 'error', message: 'no line' },
      { file: 'b.md', line: 12, check: 'y', severity: 'warning', message: 'with line' },
    ]);
    expect(output).toContain('  error  a.md  [x] no line');
    expect(output).toContain('  warn  b.md:12  [y] with line');
    expect(output).toMatch(/1 error, 1 warning$/);
  });

  it('pluralises the summary correctly', () => {
    const two = formatIssues([
      { file: 'a.md', check: 'x', severity: 'error', message: 'one' },
      { file: 'b.md', check: 'x', severity: 'error', message: 'two' },
    ]);
    expect(two).toMatch(/2 errors, 0 warnings$/);
  });
});
