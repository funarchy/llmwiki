import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { selfPin } from '../../src/commands/self-pin.js';
import { makeRepo } from '../helpers/fixture.js';

/** Recording exec stub — no real package manager ever runs in tests. */
function spy() {
  const calls: Array<{ cmd: string; cwd: string }> = [];
  return { calls, exec: (cmd: string, cwd: string) => void calls.push({ cmd, cwd }) };
}

describe('selfPin', () => {
  it('installs itself as a dev dependency via npm by default', () => {
    const repo = makeRepo({ 'package.json': '{ "name": "consumer" }\n' });
    const { calls, exec } = spy();
    const result = selfPin(repo, { exec, version: '0.1.0' });
    expect(result.installed).toBe(true);
    expect(result.packageManager).toBe('npm');
    expect(calls).toEqual([{ cmd: 'npm install --save-dev wiki-sticky@^0.1.0', cwd: repo }]);
  });

  it.each([
    ['pnpm-lock.yaml', 'pnpm', 'pnpm add -D wiki-sticky@^0.1.0'],
    ['yarn.lock', 'yarn', 'yarn add -D wiki-sticky@^0.1.0'],
    ['bun.lock', 'bun', 'bun add -d wiki-sticky@^0.1.0'],
    ['bun.lockb', 'bun', 'bun add -d wiki-sticky@^0.1.0'],
  ])('detects the package manager from %s', (lockfile, pm, cmd) => {
    const repo = makeRepo({ 'package.json': '{ "name": "consumer" }\n' });
    writeFileSync(join(repo, lockfile), '');
    const { calls, exec } = spy();
    const result = selfPin(repo, { exec, version: '0.1.0' });
    expect(result.packageManager).toBe(pm);
    expect(calls[0].cmd).toBe(cmd);
  });

  it('skips with an explicit reason when there is no package.json', () => {
    const repo = makeRepo({});
    const { calls, exec } = spy();
    const result = selfPin(repo, { exec, version: '0.1.0' });
    expect(result.installed).toBe(false);
    expect(result.skipped).toBe('no-package-json');
    expect(calls).toEqual([]);
  });

  it('skips when wiki-sticky is already a dependency (either kind)', () => {
    for (const key of ['dependencies', 'devDependencies']) {
      const repo = makeRepo({
        'package.json': `{ "name": "consumer", "${key}": { "wiki-sticky": "^0.1.0" } }\n`,
      });
      const { calls, exec } = spy();
      const result = selfPin(repo, { exec, version: '0.1.0' });
      expect(result.installed).toBe(false);
      expect(result.skipped).toBe('already-present');
      expect(calls).toEqual([]);
    }
  });

  it('skips inside the wiki-sticky repository itself', () => {
    const repo = makeRepo({ 'package.json': '{ "name": "wiki-sticky" }\n' });
    const { calls, exec } = spy();
    const result = selfPin(repo, { exec, version: '0.1.0' });
    expect(result.skipped).toBe('self');
    expect(calls).toEqual([]);
  });

  it('skips when opted out, without touching anything', () => {
    const repo = makeRepo({ 'package.json': '{ "name": "consumer" }\n' });
    const { calls, exec } = spy();
    const result = selfPin(repo, { exec, version: '0.1.0', skip: true });
    expect(result.skipped).toBe('opted-out');
    expect(calls).toEqual([]);
  });

  it('reports failure without throwing when the package manager exits non-zero', () => {
    const repo = makeRepo({ 'package.json': '{ "name": "consumer" }\n' });
    const exec = () => {
      throw new Error('npm exploded');
    };
    const result = selfPin(repo, { exec, version: '0.1.0' });
    expect(result.installed).toBe(false);
    expect(result.skipped).toBe('failed');
  });
});
