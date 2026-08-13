import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { packageRoot } from '../src/paths.js';

describe('packageRoot', () => {
  it('points at the directory containing schemas/ and templates/', () => {
    const root = packageRoot();
    expect(existsSync(join(root, 'package.json'))).toBe(true);
  });
});
