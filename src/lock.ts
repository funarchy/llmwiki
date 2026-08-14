import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Lock } from './types.js';

export const LOCK_FILENAME = 'llmwiki-lock.json';

export function readLock(repoRoot: string): Lock | null {
  const path = join(repoRoot, LOCK_FILENAME);
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as Lock;
  if (raw.version !== 1) {
    throw new Error(`Unsupported ${LOCK_FILENAME} version: ${String(raw.version)}`);
  }
  return { version: 1, bundles: raw.bundles ?? {}, skills: raw.skills ?? {} };
}

/** Stable serialization: sorted bundle names, sorted skills, 2-space indent. */
export function writeLock(repoRoot: string, lock: Lock): void {
  const sortedEntries = <T>(record: Record<string, T>) =>
    Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
  const stable: Lock = {
    version: 1,
    bundles: sortedEntries(lock.bundles),
    skills: sortedEntries(lock.skills),
  };
  writeFileSync(join(repoRoot, LOCK_FILENAME), `${JSON.stringify(stable, null, 2)}\n`);
}

export function locksEqual(a: Lock | null, b: Lock | null): boolean {
  return JSON.stringify(a && normalize(a)) === JSON.stringify(b && normalize(b));
}

function normalize(lock: Lock): unknown {
  return {
    version: lock.version,
    bundles: Object.entries(lock.bundles)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, e]) => [name, { ...e, requiredBy: [...e.requiredBy].sort() }]),
    skills: Object.entries(lock.skills).sort(([a], [b]) => a.localeCompare(b)),
  };
}
