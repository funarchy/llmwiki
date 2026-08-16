import { LOCK_FILENAME, readLock } from '../../lock.js';
import { shippedSkills, skillHash } from '../../commands/skills.js';
import type { Check } from '../run.js';
import type { Issue } from '../../types.js';

/**
 * Check 12 — flags an installed skill whose lock entry has drifted from the
 * hash of the file this package currently ships. Always warning severity
 * (spec §11, §13): a stale skill must never fail CI, only nudge
 * `wiki-sticky skills sync`.
 *
 * `config.skills: 'off'` means the plugin install path is in use instead —
 * nothing here is this project's to compare, so the check is silent.
 *
 * Under `vendored`, a user's edits to their installed copy are expected and
 * are never compared; only lock-vs-shipped drift is reported, exactly as
 * under `managed`.
 */
export const skillsCurrent: Check = (ctx) => {
  const { repoRoot, config } = ctx;
  if (config.skills === 'off') return [];

  const issues: Issue[] = [];
  const lock = readLock(repoRoot);
  const lockedHashes = lock?.skills ?? {};

  for (const name of shippedSkills()) {
    const locked = lockedHashes[name];
    if (locked === undefined || locked !== skillHash(name)) {
      issues.push({
        file: LOCK_FILENAME,
        check: 'skills-current',
        severity: 'warning',
        message: `skill "${name}" is out of date — run \`wiki-sticky skills sync\``,
      });
    }
  }

  return issues;
};
