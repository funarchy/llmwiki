import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInit } from '../../src/commands/init.js';
import { loadConfig } from '../../src/config.js';
import { shippedSkills, skillHash } from '../../src/commands/skills.js';
import { readLock } from '../../src/lock.js';
import { makeRepo } from '../helpers/fixture.js';

describe('runInit', () => {
  it('scaffolds the bundle, config and eval index', () => {
    const root = makeRepo({});
    runInit({ repoRoot: root, bundleRoot: 'wiki', installHook: false, title: 'Demo', selfPin: { exec: () => {} } });

    expect(existsSync(join(root, 'wiki-sticky.yaml'))).toBe(true);
    expect(existsSync(join(root, 'wiki', 'index.md'))).toBe(true);
    expect(existsSync(join(root, 'wiki', '_meta', 'page.schema.json'))).toBe(true);
    expect(existsSync(join(root, 'wiki', '_meta', 'eval', 'index.md'))).toBe(true);
  });

  it('installs the shipped skills into both working trees and locks their hashes', () => {
    const root = makeRepo({});
    const result = runInit({ repoRoot: root, bundleRoot: 'wiki', installHook: false, title: 'Demo', selfPin: { exec: () => {} } });

    const names = shippedSkills();
    expect([...result.skillsInstalled].sort()).toEqual([...names].sort());
    for (const name of names) {
      expect(existsSync(join(root, '.claude', 'skills', name, 'SKILL.md'))).toBe(true);
      expect(existsSync(join(root, '.agents', 'skills', name, 'SKILL.md'))).toBe(true);
    }

    const lock = readLock(root)!;
    for (const name of names) {
      expect(lock.skills[name]).toBe(skillHash(name));
    }
  });

  it('substitutes the bundle title into the root index', () => {
    const root = makeRepo({});
    runInit({ repoRoot: root, bundleRoot: 'wiki', installHook: false, title: 'Scenepad', selfPin: { exec: () => {} } });
    const index = readFileSync(join(root, 'wiki', 'index.md'), 'utf-8');
    expect(index).toContain('# Scenepad');
    expect(index).not.toContain('{{BUNDLE_TITLE}}');
  });

  it('writes a config that loads and validates', () => {
    const root = makeRepo({});
    runInit({ repoRoot: root, bundleRoot: 'knowledge', installHook: false, title: 'Demo', selfPin: { exec: () => {} } });
    const config = loadConfig(root);
    expect(config.bundle.root).toBe('knowledge');
    expect(config.skills).toBe('managed');
    expect(config.mode).toBe('copy');
  });

  it('produces a bundle that passes lint', async () => {
    const root = makeRepo({});
    runInit({ repoRoot: root, bundleRoot: 'wiki', installHook: false, title: 'Demo', selfPin: { exec: () => {} } });
    const { runLint } = await import('../../src/lint/run.js');
    await import('../../src/lint/checks/index.js');
    const { loadBundle } = await import('../../src/bundle/load.js');
    const config = loadConfig(root);
    const issues = runLint({
      repoRoot: root,
      config,
      bundle: loadBundle(root, config.bundle.root),
      gitRemote: null,
    });
    expect(issues).toEqual([]);
  });

  it('adds the bundle root, config and lint script to package.json', () => {
    const root = makeRepo({ 'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }, null, 2) });
    runInit({ repoRoot: root, bundleRoot: 'wiki', installHook: false, title: 'Demo', selfPin: { exec: () => {} } });
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    expect(pkg.files).toEqual(expect.arrayContaining(['wiki', 'wiki-sticky.yaml']));
    expect(pkg.scripts['wiki-sticky:lint']).toBe('wiki-sticky lint');
  });

  it('does not duplicate existing package.json files entries', () => {
    const root = makeRepo({
      'package.json': JSON.stringify({ name: 'demo', files: ['wiki', 'dist'] }, null, 2),
    });
    runInit({ repoRoot: root, bundleRoot: 'wiki', installHook: false, title: 'Demo', selfPin: { exec: () => {} } });
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    expect(pkg.files.filter((f: string) => f === 'wiki')).toHaveLength(1);
  });

  it('succeeds in a repository with no package.json', () => {
    const root = makeRepo({});
    expect(() =>
      runInit({ repoRoot: root, bundleRoot: 'wiki', installHook: false, title: 'Demo', selfPin: { exec: () => {} } }),
    ).not.toThrow();
  });

  it('refuses to overwrite an existing config', () => {
    const root = makeRepo({ 'wiki-sticky.yaml': 'version: 1\nbundle:\n  root: wiki\n' });
    expect(() =>
      runInit({ repoRoot: root, bundleRoot: 'wiki', installHook: false, title: 'Demo', selfPin: { exec: () => {} } }),
    ).toThrow(/already/);
  });

  it('pins itself as a dev dependency when the repository has a package.json (#14)', () => {
    const root = makeRepo({ 'package.json': '{ "name": "consumer" }\n' });
    const calls: string[] = [];
    const result = runInit({
      repoRoot: root,
      bundleRoot: 'wiki',
      installHook: false,
      title: 'Demo',
      selfPin: { exec: (cmd) => void calls.push(cmd), version: '0.1.0' },
    });
    expect(result.selfPin.installed).toBe(true);
    expect(result.selfPin.packageManager).toBe('npm');
    expect(calls).toEqual(['npm install --save-dev wiki-sticky@^0.1.0']);
  });

  it('reports the unwired state explicitly when there is no package.json (#14)', () => {
    const root = makeRepo({});
    const result = runInit({
      repoRoot: root,
      bundleRoot: 'wiki',
      installHook: false,
      title: 'Demo',
      selfPin: { exec: () => {} },
    });
    expect(result.selfPin.installed).toBe(false);
    expect(result.selfPin.skipped).toBe('no-package-json');
  });

  it('adopts an existing bundle directory without clobbering its index', () => {
    const root = makeRepo({ 'wiki/index.md': '# Existing\n\n* [A](/wiki/a.md) - a\n' });
    runInit({ repoRoot: root, bundleRoot: 'wiki', installHook: false, title: 'Demo', selfPin: { exec: () => {} } });
    expect(readFileSync(join(root, 'wiki', 'index.md'), 'utf-8')).toContain('# Existing');
    expect(existsSync(join(root, 'wiki', '_meta', 'page.schema.json'))).toBe(true);
  });

  it('installs a pre-commit hook when asked and .git/hooks exists', () => {
    const root = makeRepo({ '.git/hooks/.keep': '' });
    runInit({ repoRoot: root, bundleRoot: 'wiki', installHook: true, title: 'Demo', selfPin: { exec: () => {} } });
    const hook = join(root, '.git', 'hooks', 'pre-commit');
    expect(existsSync(hook)).toBe(true);
    const hookContent = readFileSync(hook, 'utf-8');
    expect(hookContent).toContain('node_modules/.bin/wiki-sticky');
    expect(hookContent).toContain('lint');
  });

  it('reports an existing docs/ directory without touching it', () => {
    const root = makeRepo({ 'docs/guide.md': '# Guide\n' });
    const result = runInit({ repoRoot: root, bundleRoot: 'wiki', installHook: false, title: 'Demo', selfPin: { exec: () => {} } });
    expect(result.foundDocsDir).toBe(true);
    expect(readFileSync(join(root, 'docs', 'guide.md'), 'utf-8')).toBe('# Guide\n');
  });

  it('does not overwrite an existing pre-commit hook', () => {
    const root = makeRepo({ '.git/hooks/pre-commit': '#!/bin/sh\necho mine\n' });
    const result = runInit({ repoRoot: root, bundleRoot: 'wiki', installHook: true, title: 'Demo', selfPin: { exec: () => {} } });
    expect(readFileSync(join(root, '.git', 'hooks', 'pre-commit'), 'utf-8')).toContain('echo mine');
    expect(result.hookSkipped).toBe(true);
  });

  it('rejects a bundle root that escapes the repository', () => {
    const root = makeRepo({});
    expect(() =>
      runInit({ repoRoot: root, bundleRoot: '../escaped', installHook: false, title: 'Demo', selfPin: { exec: () => {} } }),
    ).toThrow();
    expect(existsSync(join(root, '..', 'escaped'))).toBe(false);
  });

  it('rejects a bundle root that YAML would reinterpret', () => {
    const root = makeRepo({});
    expect(() =>
      runInit({ repoRoot: root, bundleRoot: 'my: bundle', installHook: false, title: 'Demo', selfPin: { exec: () => {} } }),
    ).toThrow();
    expect(existsSync(join(root, 'wiki-sticky.yaml'))).toBe(false);
  });
});
