import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageRoot } from '../../src/paths.js';
import { shippedSkills } from '../../src/commands/skills.js';

const CLI = join(packageRoot(), 'dist', 'cli.js');

// Combines stdout+stderr regardless of exit code: `lint` writes its warning
// summary to stderr even on a zero (warning-only) exit, and execFileSync
// discards stderr on the success path.
function run(args: string[], cwd: string): { stdout: string; status: number } {
  const result = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf-8' });
  return { stdout: `${result.stdout ?? ''}${result.stderr ?? ''}`, status: result.status ?? 1 };
}

function setSkillsMode(cwd: string, mode: 'managed' | 'vendored' | 'off'): void {
  const path = join(cwd, 'wiki-sticky.yaml');
  const content = readFileSync(path, 'utf-8').replace(/^skills: \w+$/m, `skills: ${mode}`);
  writeFileSync(path, content);
}

describe('wiki-sticky skillset (CLI end to end)', () => {
  beforeAll(() => {
    execFileSync('npm', ['run', 'build'], { cwd: packageRoot(), stdio: 'ignore' });
  });

  it('init --yes installs the five skills into both trees and locks five hashes', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wiki-sticky-skills-'));
    const init = run(['init', '--yes'], cwd);
    expect(init.status).toBe(0);

    const names = shippedSkills();
    expect(names).toHaveLength(5);
    for (const name of names) {
      expect(existsSync(join(cwd, '.claude', 'skills', name, 'SKILL.md'))).toBe(true);
      expect(existsSync(join(cwd, '.agents', 'skills', name, 'SKILL.md'))).toBe(true);
    }

    const lock = JSON.parse(readFileSync(join(cwd, 'wiki-sticky-lock.json'), 'utf-8')) as {
      skills: Record<string, string>;
    };
    expect(Object.keys(lock.skills).sort()).toEqual([...names].sort());
  });

  it('corrupting an installed skill then `skills sync` restores it (managed mode)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wiki-sticky-skills-'));
    run(['init', '--yes'], cwd);

    const name = shippedSkills()[0];
    const claudePath = join(cwd, '.claude', 'skills', name, 'SKILL.md');
    const canonical = readFileSync(claudePath, 'utf-8');
    writeFileSync(claudePath, 'corrupted by hand\n');
    expect(readFileSync(claudePath, 'utf-8')).toBe('corrupted by hand\n');

    const sync = run(['skills', 'sync'], cwd);
    expect(sync.status).toBe(0);
    expect(readFileSync(claudePath, 'utf-8')).toBe(canonical);
  });

  it('lint exits 0 but reports a warning when a stale skill hash is planted in the lock', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wiki-sticky-skills-'));
    run(['init', '--yes'], cwd);

    const lockPath = join(cwd, 'wiki-sticky-lock.json');
    const lock = JSON.parse(readFileSync(lockPath, 'utf-8')) as { skills: Record<string, string> };
    const name = shippedSkills()[0];
    lock.skills[name] = 'sha256-0000000000000000000000000000000000000000000000000000000000000000';
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

    const lint = run(['lint'], cwd);
    expect(lint.status).toBe(0);
    expect(lint.stdout).toMatch(/warn/);
    expect(lint.stdout).toMatch(/skills-current/);
    expect(lint.stdout).toContain(name);
  });

  it('`skills sync` with skills: off is a no-op that says so', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'wiki-sticky-skills-'));
    run(['init', '--yes'], cwd);
    setSkillsMode(cwd, 'off');

    // init already synced skills before the mode was flipped to `off`.
    // Corrupt one installed copy, then prove `sync` under `off` really does
    // nothing — it must not restore, overwrite, or touch it either way.
    const name = shippedSkills()[0];
    const claudePath = join(cwd, '.claude', 'skills', name, 'SKILL.md');
    writeFileSync(claudePath, 'left alone\n');

    const sync = run(['skills', 'sync'], cwd);
    expect(sync.status).toBe(0);
    expect(sync.stdout).toMatch(/off/);
    expect(sync.stdout).toMatch(/no-op/);
    expect(readFileSync(claudePath, 'utf-8')).toBe('left alone\n');
  });
});
