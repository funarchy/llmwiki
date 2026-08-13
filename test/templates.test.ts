import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageRoot } from '../src/paths.js';

const templates = ['root-index.md', 'eval-index.md', 'pre-commit.sh'];

describe('templates', () => {
  it.each(templates)('%s exists', (name) => {
    expect(existsSync(join(packageRoot(), 'templates', name))).toBe(true);
  });

  it('root-index.md carries the title placeholder and okf_version', () => {
    const content = readFileSync(join(packageRoot(), 'templates', 'root-index.md'), 'utf-8');
    expect(content).toContain('{{BUNDLE_TITLE}}');
    expect(content).toContain("okf_version: '0.2'");
  });
});
