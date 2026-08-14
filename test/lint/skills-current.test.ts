import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { skillsCurrent } from '../../src/lint/checks/skills-current.js';
import { exitCodeFor } from '../../src/lint/run.js';
import { syncSkills, shippedSkills } from '../../src/commands/skills.js';
import { loadConfig } from '../../src/config.js';
import { readLock, writeLock } from '../../src/lock.js';
import { makeRepo } from '../helpers/fixture.js';
import { contextFor } from '../helpers/lint.js';

function setup(skillsMode: 'managed' | 'vendored' | 'off' = 'managed') {
  const repo = makeRepo({
    'llmwiki.yaml': `version: 1\nbundle:\n  root: llmwiki\nskills: ${skillsMode}\n`,
    'llmwiki/index.md': '# Root\n',
  });
  return repo;
}

describe('check: skills-current', () => {
  it('is silent right after a sync (lock matches shipped hashes)', () => {
    const repo = setup('managed');
    syncSkills(repo, loadConfig(repo));
    expect(skillsCurrent(contextFor(repo))).toEqual([]);
  });

  it('warns when the lock hash is stale', () => {
    const repo = setup('managed');
    const config = loadConfig(repo);
    syncSkills(repo, config);

    const name = shippedSkills()[0];
    const lock = readLock(repo)!;
    lock.skills[name] = 'sha256-0000000000000000000000000000000000000000000000000000000000000000';
    writeLock(repo, lock);

    const issues = skillsCurrent(contextFor(repo));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toContain(name);
    expect(issues[0].message).toContain('llmwiki skills sync');
  });

  it('warns when a shipped skill has no lock entry at all', () => {
    const repo = setup('managed');
    // No sync at all: llmwiki-lock.json does not exist.
    const issues = skillsCurrent(contextFor(repo));
    expect(issues.length).toBe(shippedSkills().length);
    expect(issues.every((i) => i.severity === 'warning')).toBe(true);
  });

  it('vendored: a user edit to the installed copy stays silent (lock still holds the shipped hash); simulated lock staleness still warns', () => {
    const repo = setup('vendored');
    const config = loadConfig(repo);
    syncSkills(repo, config);

    const name = shippedSkills()[0];
    // A user edits their installed copy directly — vendored mode is
    // "install once, never overwrite", so this is expected and must not be
    // compared against.
    writeFileSync(join(repo, '.claude', 'skills', name, 'SKILL.md'), 'user customization\n');
    expect(skillsCurrent(contextFor(repo))).toEqual([]);

    // Simulate a shipped-skill content bump (the real trigger is "the
    // package now ships a newer SKILL.md than what's locked") by writing a
    // stale hash straight into the lock — same effect as skillHash(name)
    // changing without re-syncing.
    const lock = readLock(repo)!;
    lock.skills[name] = 'sha256-0000000000000000000000000000000000000000000000000000000000000000';
    writeLock(repo, lock);

    const issues = skillsCurrent(contextFor(repo));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toContain(name);
  });

  it('is silent when config.skills is "off"', () => {
    const repo = setup('off');
    expect(skillsCurrent(contextFor(repo))).toEqual([]);
  });

  it('keeps the exit code at 0 even when it is the only finding', () => {
    const repo = setup('managed');
    const issues = skillsCurrent(contextFor(repo));
    expect(issues.length).toBeGreaterThan(0);
    expect(exitCodeFor(issues)).toBe(0);
  });
});
