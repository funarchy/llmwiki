import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { shippedSkills, skillHash, syncSkills, skillsCommand } from '../../src/commands/skills.js';
import { loadConfig } from '../../src/config.js';
import { readLock, writeLock } from '../../src/lock.js';
import { packageRoot } from '../../src/paths.js';
import { makeRepo } from '../helpers/fixture.js';

function skillsConfig(mode: 'managed' | 'vendored' | 'off' = 'managed'): Record<string, string> {
  return { 'llmwiki.yaml': `version: 1\nbundle:\n  root: llmwiki\nskills: ${mode}\n` };
}

describe('syncSkills', () => {
  it('managed mode installs all five skills into both trees and locks their hashes', () => {
    const repo = makeRepo(skillsConfig('managed'));
    const config = loadConfig(repo);
    const result = syncSkills(repo, config);

    const names = shippedSkills();
    expect(names).toHaveLength(5);
    expect([...result.installed].sort()).toEqual([...names].sort());

    for (const name of names) {
      expect(existsSync(join(repo, '.claude', 'skills', name, 'SKILL.md'))).toBe(true);
      expect(existsSync(join(repo, '.agents', 'skills', name, 'SKILL.md'))).toBe(true);
    }

    const lock = readLock(repo)!;
    expect(Object.keys(lock.skills).sort()).toEqual([...names].sort());
  });

  it('installed copy is byte-identical to the canonical shipped file', () => {
    const repo = makeRepo(skillsConfig('managed'));
    const config = loadConfig(repo);
    syncSkills(repo, config);

    const name = shippedSkills()[0];
    const canonical = readFileSync(join(packageRoot(), 'skills', name, 'SKILL.md'));
    const installedClaude = readFileSync(join(repo, '.claude', 'skills', name, 'SKILL.md'));
    const installedAgents = readFileSync(join(repo, '.agents', 'skills', name, 'SKILL.md'));
    expect(installedClaude.equals(canonical)).toBe(true);
    expect(installedAgents.equals(canonical)).toBe(true);
  });

  it('managed re-sync overwrites a local edit', () => {
    const repo = makeRepo(skillsConfig('managed'));
    const config = loadConfig(repo);
    syncSkills(repo, config);

    const name = shippedSkills()[0];
    const path = join(repo, '.claude', 'skills', name, 'SKILL.md');
    writeFileSync(path, 'edited by user\n');

    syncSkills(repo, config);
    expect(readFileSync(path, 'utf-8')).not.toBe('edited by user\n');
  });

  it('vendored mode never overwrites an already-installed skill, but still locks the shipped hash', () => {
    const repo = makeRepo(skillsConfig('vendored'));
    const config = loadConfig(repo);
    syncSkills(repo, config);

    const name = shippedSkills()[0];
    const path = join(repo, '.claude', 'skills', name, 'SKILL.md');
    writeFileSync(path, 'user customization\n');

    const result = syncSkills(repo, config);
    expect(readFileSync(path, 'utf-8')).toBe('user customization\n');
    expect(result.skipped).toContain(name);

    const lock = readLock(repo)!;
    expect(lock.skills[name]).toBe(skillHash(name));
  });

  it('off mode leaves the tree and lock untouched', () => {
    const repo = makeRepo(skillsConfig('off'));
    const config = loadConfig(repo);
    const result = syncSkills(repo, config);

    expect(result.installed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(existsSync(join(repo, '.claude', 'skills'))).toBe(false);
    expect(existsSync(join(repo, '.agents', 'skills'))).toBe(false);
    expect(existsSync(join(repo, 'llmwiki-lock.json'))).toBe(false);
  });

  it('preserves Lock.bundles across a skills write (read-modify-write)', () => {
    const repo = makeRepo(skillsConfig('managed'));
    writeLock(repo, {
      version: 1,
      bundles: {
        fake: {
          source: 'npm',
          version: '1.0.0',
          resolvedFrom: 'node_modules/fake',
          upstreamHash: 'sha256-deadbeef',
          requiredBy: ['.'],
        },
      },
      skills: {},
    });

    const config = loadConfig(repo);
    syncSkills(repo, config);

    const lock = readLock(repo)!;
    expect(lock.bundles.fake).toBeDefined();
    expect(lock.bundles.fake.version).toBe('1.0.0');
  });

  it('hashes are stable across two syncs', () => {
    const repo = makeRepo(skillsConfig('managed'));
    const config = loadConfig(repo);
    syncSkills(repo, config);
    const first = readLock(repo)!.skills;
    syncSkills(repo, config);
    const second = readLock(repo)!.skills;
    expect(second).toEqual(first);
  });
});

describe('skillsCommand', () => {
  it('errors on an unknown subcommand', () => {
    const repo = makeRepo(skillsConfig('managed'));
    expect(() => skillsCommand(repo, 'bogus')).toThrow(/sync/);
  });

  it('syncs skills when given "sync"', () => {
    const repo = makeRepo(skillsConfig('managed'));
    const code = skillsCommand(repo, 'sync');
    expect(code).toBe(0);
    const names = shippedSkills();
    for (const name of names) {
      expect(existsSync(join(repo, '.claude', 'skills', name, 'SKILL.md'))).toBe(true);
    }
  });
});
