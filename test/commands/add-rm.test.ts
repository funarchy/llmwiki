import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addCommand } from '../../src/commands/add.js';
import { rmCommand } from '../../src/commands/rm.js';
import { syncDeps } from '../../src/commands/install.js';
import { readLock, LOCK_FILENAME } from '../../src/lock.js';
import { loadConfig } from '../../src/config.js';
import { makeRepo, configYaml } from '../helpers/fixture.js';
import { writeProducer } from '../helpers/producer.js';

describe('addCommand', () => {
  it('adds an npm dep: config gains the entry (comment preserved), tree vendored, lock written', () => {
    const repo = makeRepo({
      'wiki-sticky.yaml': 'version: 1\nbundle:\n  root: wiki\n# pinned deliberately\ndeps: {}\n',
      'wiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });

    const code = addCommand(repo, 'a', {});
    expect(code).toBe(0);

    const rawYaml = readFileSync(join(repo, 'wiki-sticky.yaml'), 'utf-8');
    expect(rawYaml).toContain('# pinned deliberately');

    const config = loadConfig(repo);
    expect(config.deps.a).toEqual({ source: 'npm' });

    expect(existsSync(join(repo, 'wiki', 'deps', 'a', 'index.md'))).toBe(true);

    const lock = readLock(repo)!;
    expect(lock.bundles.a.version).toBe('1.0.0');
    expect(lock.bundles.a.source).toBe('npm');
  });

  it('adds a path dep', () => {
    const repo = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'ext-a'), { name: 'a', version: '2.0.0' });

    const code = addCommand(repo, 'a', { path: 'ext-a' });
    expect(code).toBe(0);

    const config = loadConfig(repo);
    expect(config.deps.a).toEqual({ source: 'path', path: 'ext-a' });
    expect(existsSync(join(repo, 'wiki', 'deps', 'a', 'index.md'))).toBe(true);

    const lock = readLock(repo)!;
    expect(lock.bundles.a.version).toBe('2.0.0');
    expect(lock.bundles.a.source).toBe('path');
  });

  it('leaves the config byte-identical when the package cannot be resolved', () => {
    const repo = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
    });
    const before = readFileSync(join(repo, 'wiki-sticky.yaml'));

    expect(() => addCommand(repo, 'missing-pkg', {})).toThrow(/not installed/);

    const after = readFileSync(join(repo, 'wiki-sticky.yaml'));
    expect(after).toEqual(before);
    expect(existsSync(join(repo, LOCK_FILENAME))).toBe(false);
    expect(existsSync(join(repo, 'wiki', 'deps'))).toBe(false);
  });

  it('errors when the package is already a dependency', () => {
    const repo = makeRepo({
      'wiki-sticky.yaml': 'version: 1\nbundle:\n  root: wiki\ndeps:\n  a: npm\n',
      'wiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });

    expect(() => addCommand(repo, 'a', {})).toThrow(/already a dependency/);
  });
});

describe('rmCommand', () => {
  it('removes the config entry, vendored tree, and lock entry', () => {
    const repo = makeRepo({
      'wiki-sticky.yaml': 'version: 1\nbundle:\n  root: wiki\ndeps:\n  a: npm\n',
      'wiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    syncDeps(repo, loadConfig(repo), { frozen: false });
    expect(existsSync(join(repo, 'wiki', 'deps', 'a'))).toBe(true);

    const code = rmCommand(repo, 'a');
    expect(code).toBe(0);

    expect(loadConfig(repo).deps.a).toBeUndefined();
    expect(existsSync(join(repo, 'wiki', 'deps', 'a'))).toBe(false);
    const lock = readLock(repo)!;
    expect(lock.bundles.a).toBeUndefined();
  });

  it('keeps a bundle still transitively required by a remaining dep, and removes it once nothing needs it', () => {
    const repo = makeRepo({
      'wiki-sticky.yaml': 'version: 1\nbundle:\n  root: wiki\ndeps:\n  a: npm\n  b: npm\n',
      'wiki/index.md': '# Root\n',
    });
    writeProducer(join(repo, 'node_modules', 'c'), { name: 'c', version: '1.0.0' });
    writeProducer(join(repo, 'node_modules', 'a'), {
      name: 'a',
      version: '1.0.0',
      configExtra: 'deps:\n  c: npm\n',
    });
    writeProducer(join(repo, 'node_modules', 'b'), { name: 'b', version: '1.0.0' });
    syncDeps(repo, loadConfig(repo), { frozen: false });
    expect(existsSync(join(repo, 'wiki', 'deps', 'c'))).toBe(true);

    rmCommand(repo, 'b');
    expect(existsSync(join(repo, 'wiki', 'deps', 'b'))).toBe(false);
    expect(existsSync(join(repo, 'wiki', 'deps', 'c'))).toBe(true);
    expect(readLock(repo)!.bundles.c).toBeDefined();

    rmCommand(repo, 'a');
    expect(existsSync(join(repo, 'wiki', 'deps', 'a'))).toBe(false);
    expect(existsSync(join(repo, 'wiki', 'deps', 'c'))).toBe(false);
    expect(readLock(repo)!.bundles.c).toBeUndefined();
  });

  it('errors when the package is not a declared dependency', () => {
    const repo = makeRepo({
      'wiki-sticky.yaml': configYaml(),
      'wiki/index.md': '# Root\n',
    });

    expect(() => rmCommand(repo, 'nope')).toThrow(/not a dependency/);
  });
});
