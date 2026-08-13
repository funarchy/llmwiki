import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { packageRoot } from '../src/paths.js';

describe('packageRoot', () => {
  it('resolves to the package root', () => {
    const root = packageRoot();
    expect(existsSync(join(root, 'package.json'))).toBe(true);
  });
});
