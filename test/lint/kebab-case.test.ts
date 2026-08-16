import { describe, it, expect } from 'vitest';
import { kebabCase } from '../../src/lint/checks/kebab-case.js';
import { makeRepo, configYaml, page } from '../helpers/fixture.js';
import { contextFor } from '../helpers/lint.js';

describe('check: kebab-case', () => {
  it('accepts kebab-case concept page filenames', () => {
    const root = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
      'wiki/level-progression.md': page('Level progression'),
      'wiki/pms2.md': page('PMS 2'),
    });
    expect(kebabCase(contextFor(root))).toEqual([]);
  });

  it('flags camelCase, snake_case and spaces', () => {
    const root = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
      'wiki/levelProgression.md': page('A'),
      'wiki/level_progression.md': page('B'),
      'wiki/Level Progression.md': page('C'),
    });
    const issues = kebabCase(contextFor(root));
    expect(issues).toHaveLength(3);
    expect(issues.every((i) => i.check === 'kebab-case' && i.severity === 'error')).toBe(true);
  });

  it('does not flag index.md or the bundle README', () => {
    const root = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
      'wiki/README.md': '# Readme\n',
    });
    expect(kebabCase(contextFor(root))).toEqual([]);
  });

  it('reports the offending filename in the message', () => {
    const root = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
      'wiki/badName.md': page('Bad'),
    });
    const issues = kebabCase(contextFor(root));
    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('wiki/badName.md');
    expect(issues[0].message).toMatch(/badName\.md/);
  });
});
