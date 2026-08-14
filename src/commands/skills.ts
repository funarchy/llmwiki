import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot, loadConfig } from '../config.js';
import { readLock, writeLock } from '../lock.js';
import { packageRoot } from '../paths.js';
import type { Config, Lock } from '../types.js';

/** Skill names shipped with this package, from `packageRoot()/skills/`, sorted. */
export function shippedSkills(): string[] {
  const dir = join(packageRoot(), 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** sha256 of a shipped skill's canonical `SKILL.md`, as `sha256-<hex>`. */
export function skillHash(name: string): string {
  const content = readFileSync(join(packageRoot(), 'skills', name, 'SKILL.md'));
  return `sha256-${createHash('sha256').update(content).digest('hex')}`;
}

/** The two trees a skill is installed into. */
const INSTALL_TREES = ['.claude/skills', '.agents/skills'];

/**
 * Install/refresh skills into a repository per `config.skills`.
 *
 * - `managed` (default): overwrite both trees every time, so a shipped update
 *   always lands.
 * - `vendored`: install into a tree only when absent there — an existing copy
 *   is a user's, and is never touched.
 * - `off`: no-op; the plugin install path is in use.
 *
 * In every non-`off` mode, `Lock.skills[name]` is set to the *shipped* hash —
 * under `vendored` this means the lock can disagree with a user-edited
 * installed copy on purpose (check 12 compares lock-vs-shipped, not
 * lock-vs-installed). The lock is read-modify-written: `Lock.bundles` is
 * carried through untouched.
 */
export function syncSkills(repoRoot: string, config: Config): { installed: string[]; skipped: string[] } {
  const installed: string[] = [];
  const skipped: string[] = [];

  if (config.skills === 'off') {
    return { installed, skipped };
  }

  const names = shippedSkills();
  const lock: Lock = readLock(repoRoot) ?? { version: 1, bundles: {}, skills: {} };

  for (const name of names) {
    const src = join(packageRoot(), 'skills', name, 'SKILL.md');
    let copiedAny = false;

    for (const tree of INSTALL_TREES) {
      const destPath = join(repoRoot, ...tree.split('/'), name, 'SKILL.md');
      if (config.skills === 'vendored' && existsSync(destPath)) continue;
      mkdirSync(join(repoRoot, ...tree.split('/'), name), { recursive: true });
      copyFileSync(src, destPath);
      copiedAny = true;
    }

    if (copiedAny) installed.push(name);
    else skipped.push(name);

    lock.skills[name] = skillHash(name);
  }

  writeLock(repoRoot, lock);
  return { installed, skipped };
}

export function skillsCommand(cwd: string, sub: string): number {
  if (sub !== 'sync') {
    throw new Error(`Unknown "skills" subcommand "${sub}" — did you mean "skills sync"?`);
  }

  const repoRoot = findRepoRoot(cwd);
  if (!repoRoot) throw new Error('No llmwiki.yaml found — run `llmwiki init` first.');

  const config = loadConfig(repoRoot);
  if (config.skills === 'off') {
    console.log('skills: off — no-op (the plugin install path is in use)');
    return 0;
  }

  const { installed, skipped } = syncSkills(repoRoot, config);
  if (installed.length > 0) {
    console.log(`Installed ${installed.length} skill${installed.length === 1 ? '' : 's'}: ${installed.join(', ')}`);
  }
  if (skipped.length > 0) {
    console.log(
      `Left ${skipped.length} already-installed skill${skipped.length === 1 ? '' : 's'} untouched (vendored mode preserves local edits): ${skipped.join(', ')}`,
    );
  }
  return 0;
}
