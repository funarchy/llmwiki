import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findRepoRoot, loadConfig, CONFIG_FILENAME, DEFAULT_ROOT } from '../src/config.js';

function tempRepo(configYaml?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'llmwiki-cfg-'));
  if (configYaml !== undefined) writeFileSync(join(dir, CONFIG_FILENAME), configYaml);
  return dir;
}

describe('findRepoRoot', () => {
  it('finds the directory holding llmwiki.yaml from a nested path', () => {
    const root = tempRepo('version: 1\nbundle:\n  root: llmwiki\n');
    const nested = join(root, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    expect(findRepoRoot(nested)).toBe(root);
  });

  it('returns null when no config exists above the start directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'llmwiki-none-'));
    expect(findRepoRoot(dir)).toBeNull();
  });
});

describe('loadConfig', () => {
  it('applies defaults for optional sections, including an omitted bundle root', () => {
    // `bundle: {}` omits `root`, so this actually exercises the DEFAULT_ROOT fallback.
    const root = tempRepo('version: 1\nbundle: {}\n');
    const config = loadConfig(root);
    expect(config.bundle.root).toBe(DEFAULT_ROOT);
    expect(config.deps).toEqual({});
    expect(config.vendor).toEqual({});
    expect(config.skills).toBe('managed');
    expect(config.mode).toBe('copy');
  });

  it('normalizes the npm shorthand into a DepSpec', () => {
    const root = tempRepo(
      ['version: 1', 'bundle:', '  root: llmwiki', 'deps:', "  '@funarchy/scenepad': npm"].join('\n'),
    );
    const config = loadConfig(root);
    expect(config.deps['@funarchy/scenepad']).toEqual({ source: 'npm' });
  });

  it('keeps a table dep spec intact', () => {
    const root = tempRepo(
      [
        'version: 1',
        'bundle:',
        '  root: llmwiki',
        'deps:',
        "  '@funarchy/koota-pms':",
        '    source: path',
        '    path: ../koota-pms',
      ].join('\n'),
    );
    const config = loadConfig(root);
    expect(config.deps['@funarchy/koota-pms']).toEqual({ source: 'path', path: '../koota-pms' });
  });

  it('rejects an unknown top-level key', () => {
    const root = tempRepo('version: 1\nbundle:\n  root: llmwiki\nnonsense: true\n');
    expect(() => loadConfig(root)).toThrow(/nonsense/);
  });

  it('rejects a missing bundle section', () => {
    const root = tempRepo('version: 1\n');
    expect(() => loadConfig(root)).toThrow(/bundle/);
  });

  it('rejects an unsupported version', () => {
    const root = tempRepo('version: 2\nbundle:\n  root: llmwiki\n');
    expect(() => loadConfig(root)).toThrow(/version/);
  });

  it('rejects a bundle root that climbs out of the repository', () => {
    const root = tempRepo('version: 1\nbundle:\n  root: ../../etc\n');
    expect(() => loadConfig(root)).toThrow(/inside the repository/);
  });

  it('rejects an absolute bundle root', () => {
    const root = tempRepo('version: 1\nbundle:\n  root: /etc\n');
    expect(() => loadConfig(root)).toThrow(/inside the repository/);
  });

  it('rejects the repository root itself as the bundle root', () => {
    const root = tempRepo('version: 1\nbundle:\n  root: .\n');
    expect(() => loadConfig(root)).toThrow(/inside the repository/);
  });

  it('accepts a nested bundle root', () => {
    const root = tempRepo('version: 1\nbundle:\n  root: docs/knowledge\n');
    expect(loadConfig(root).bundle.root).toBe('docs/knowledge');
  });

  it('requires path on a path dep', () => {
    const root = tempRepo(
      ['version: 1', 'bundle: {}', 'deps:', '  local:', '    source: path'].join('\n'),
    );
    expect(() => loadConfig(root)).toThrow(/path/);
  });

  it('requires url on a git dep', () => {
    const root = tempRepo(
      ['version: 1', 'bundle: {}', 'deps:', '  remote:', '    source: git'].join('\n'),
    );
    expect(() => loadConfig(root)).toThrow(/url/);
  });
});
