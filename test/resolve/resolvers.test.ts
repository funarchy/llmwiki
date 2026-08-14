import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { resolvePathDep } from '../../src/resolve/path.js';
import { resolveNpmDep } from '../../src/resolve/npm.js';
import { makeRepo, configYaml } from '../helpers/fixture.js';
import { writeProducer } from '../helpers/producer.js';

describe('resolvePathDep', () => {
  it('resolves with producer root and declared deps', () => {
    const producerDir = makeRepo({});
    writeProducer(producerDir, {
      name: 'a',
      version: '2.0.0',
      root: 'wiki',
      configExtra: 'deps:\n  "b": npm\n',
    });
    const consumerDir = makeRepo({});
    const resolved = resolvePathDep(consumerDir, 'a', { source: 'path', path: producerDir });
    expect(resolved.version).toBe('2.0.0');
    expect(resolved.producerRoot).toBe('wiki');
    expect(resolved.declaredDeps).toEqual({ b: { source: 'npm' } });
    expect(resolved.absDir).toBe(producerDir);
    expect(resolved.source).toBe('path');
  });

  it('errors naming wiki-vendor when there is no llmwiki.yaml', () => {
    const producerDir = makeRepo({});
    writeProducer(producerDir, { name: 'a', noBundle: true });
    const consumerDir = makeRepo({});
    expect(() => resolvePathDep(consumerDir, 'a', { source: 'path', path: producerDir })).toThrow(/wiki-vendor/);
  });

  it('errors when the producer declares no version anywhere', () => {
    const producerDir = makeRepo({
      'llmwiki.yaml': configYaml(),
      'llmwiki/index.md': '# Index\n',
    });
    const consumerDir = makeRepo({});
    expect(() => resolvePathDep(consumerDir, 'a', { source: 'path', path: producerDir })).toThrow(/declares no version/);
  });

  it('falls back to bundle.version when there is no package.json', () => {
    const producerDir = makeRepo({
      'llmwiki.yaml': 'version: 1\nbundle:\n  root: llmwiki\n  version: 3.4.5\n',
      'llmwiki/index.md': '# Index\n',
    });
    const consumerDir = makeRepo({});
    const resolved = resolvePathDep(consumerDir, 'a', { source: 'path', path: producerDir });
    expect(resolved.version).toBe('3.4.5');
  });
});

describe('resolveNpmDep', () => {
  it('resolves from top-level node_modules', () => {
    const repoRoot = makeRepo({});
    writeProducer(join(repoRoot, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    const { resolved, warning } = resolveNpmDep(repoRoot, null, 'a');
    expect(resolved.version).toBe('1.0.0');
    expect(resolved.source).toBe('npm');
    expect(warning).toBeUndefined();
  });

  it('resolves a scoped name (@scope/name)', () => {
    const repoRoot = makeRepo({});
    writeProducer(join(repoRoot, 'node_modules', '@scope', 'name'), { name: '@scope/name', version: '1.0.0' });
    const { resolved } = resolveNpmDep(repoRoot, null, '@scope/name');
    expect(resolved.version).toBe('1.0.0');
    expect(resolved.absDir).toBe(join(repoRoot, 'node_modules', '@scope', 'name'));
  });

  it('errors with "not installed" when the package is missing entirely', () => {
    const repoRoot = makeRepo({});
    expect(() => resolveNpmDep(repoRoot, null, 'missing')).toThrow(/not installed/);
  });

  it('falls back to the nested copy when top-level is absent', () => {
    const repoRoot = makeRepo({});
    const requirerDir = join(repoRoot, 'node_modules', 'requirer');
    writeProducer(requirerDir, { name: 'requirer', version: '1.0.0' });
    writeProducer(join(requirerDir, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    const { resolved, warning } = resolveNpmDep(repoRoot, requirerDir, 'a');
    expect(resolved.version).toBe('1.0.0');
    expect(resolved.absDir).toBe(join(requirerDir, 'node_modules', 'a'));
    expect(warning).toBeUndefined();
  });

  it('top-level shadows nested with a warning when versions differ', () => {
    const repoRoot = makeRepo({});
    writeProducer(join(repoRoot, 'node_modules', 'a'), { name: 'a', version: '2.0.0' });
    const requirerDir = join(repoRoot, 'node_modules', 'requirer');
    writeProducer(requirerDir, { name: 'requirer', version: '1.0.0' });
    writeProducer(join(requirerDir, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    const { resolved, warning } = resolveNpmDep(repoRoot, requirerDir, 'a');
    expect(resolved.version).toBe('2.0.0');
    expect(resolved.absDir).toBe(join(repoRoot, 'node_modules', 'a'));
    expect(warning).toMatch(/"a" exists at top-level/);
    expect(warning).toMatch(/v2\.0\.0/);
    expect(warning).toMatch(/v1\.0\.0/);
  });

  it('no warning when top-level and nested versions match', () => {
    const repoRoot = makeRepo({});
    writeProducer(join(repoRoot, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    const requirerDir = join(repoRoot, 'node_modules', 'requirer');
    writeProducer(requirerDir, { name: 'requirer', version: '1.0.0' });
    writeProducer(join(requirerDir, 'node_modules', 'a'), { name: 'a', version: '1.0.0' });
    const { resolved, warning } = resolveNpmDep(repoRoot, requirerDir, 'a');
    expect(resolved.version).toBe('1.0.0');
    expect(warning).toBeUndefined();
  });
});
