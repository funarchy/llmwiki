import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_FILENAME } from '../../config.js';
import { LOCK_FILENAME, readLock } from '../../lock.js';
import { resolveNpmDep } from '../../resolve/npm.js';
import { resolvePathDep, type Resolved } from '../../resolve/path.js';
import { vendorableFiles } from '../../vendor/files.js';
import { hashBundle } from '../../vendor/hash.js';
import { rewritePage } from '../../vendor/rewrite.js';
import type { Check } from '../run.js';
import type { Issue, Lock, LockBundle } from '../../types.js';

/**
 * Bundle names actually present on disk under `deps/`, sorted, accounting for
 * scoped names (`@scope/name` sits two levels deep). Mirrors how vendorBundle
 * and linkBundle lay out `bundle.name.split('/')`.
 */
function bundleDirNames(depsDir: string): string[] {
  if (!existsSync(depsDir)) return [];
  const names: string[] = [];
  for (const entry of readdirSync(depsDir, { withFileTypes: true })) {
    if (!(entry.isDirectory() || entry.isSymbolicLink())) continue;
    if (entry.name.startsWith('@')) {
      for (const sub of readdirSync(join(depsDir, entry.name), { withFileTypes: true })) {
        if (sub.isDirectory() || sub.isSymbolicLink()) names.push(`${entry.name}/${sub.name}`);
      }
    } else {
      names.push(entry.name);
    }
  }
  return names;
}

/**
 * Derive the requirer's directory for a nested-only npm resolution from the
 * locked `resolvedFrom` path (repo-relative posix), e.g.
 * `node_modules/a/node_modules/b` → `<repoRoot>/node_modules/a`. Returns null
 * for a top-level resolution (`node_modules/b`), matching `requirerDir: null`.
 */
function npmRequirerDir(repoRoot: string, resolvedFrom: string): string | null {
  const parts = resolvedFrom.split('/');
  const lastNodeModules = parts.lastIndexOf('node_modules');
  if (lastNodeModules <= 0) return null;
  return join(repoRoot, ...parts.slice(0, lastNodeModules));
}

/** Resolve the producer a lock entry names, reusing the graph's own resolvers. */
function resolveProducer(repoRoot: string, name: string, entry: LockBundle): Resolved {
  if (entry.source === 'npm') {
    return resolveNpmDep(repoRoot, npmRequirerDir(repoRoot, entry.resolvedFrom), name).resolved;
  }
  return resolvePathDep(repoRoot, name, { source: 'path', path: entry.resolvedFrom });
}

/**
 * The trust anchor of the composition layer: re-derives the entire vendoring
 * (resolve producer → hashBundle → vendorableFiles + rewritePage in memory)
 * and compares byte-for-byte with the vendored tree. A mismatch means
 * hand-editing or staleness, never a false accusation (see the plan's G1–G3
 * review note on CRLF/newline/lone-\r re-derivation).
 */
export const vendoredLock: Check = (ctx) => {
  const { repoRoot, config } = ctx;
  const root = config.bundle.root;
  const issues: Issue[] = [];
  const depsDir = join(repoRoot, root, 'deps');
  const dirNames = new Set(bundleDirNames(depsDir));

  const lock: Lock | null = readLock(repoRoot);

  if (lock === null) {
    if (dirNames.size > 0) {
      issues.push({
        file: `${root}/deps`,
        check: 'vendored-lock',
        severity: 'error',
        message: `vendored bundles exist with no ${LOCK_FILENAME} — run \`llmwiki install\``,
      });
    }
    // Fall through to the config-vs-lock comparison below (empty lockNames):
    // a declared dep with no lock at all — fresh init never installed, or a
    // TOCTOU window in `add` — must not lint clean.
  }

  const lockNames = new Set(lock ? Object.keys(lock.bundles) : []);

  // These two compare the lock against the vendored tree — meaningless (and
  // redundant with the generic message above) when there is no lock at all.
  if (lock !== null) {
    for (const name of lockNames) {
      if (!dirNames.has(name)) {
        issues.push({
          file: `${root}/deps/${name}`,
          check: 'vendored-lock',
          severity: 'error',
          message: `"${name}" is locked but not vendored — run \`llmwiki install\``,
        });
      }
    }

    for (const name of dirNames) {
      if (!lockNames.has(name)) {
        issues.push({
          file: `${root}/deps/${name}`,
          check: 'vendored-lock',
          severity: 'error',
          message: `"${name}" is vendored under deps/ but has no ${LOCK_FILENAME} entry — hand-added? run \`llmwiki install\``,
        });
      }
    }
  }

  // Unconditional: a declared dep with no lock entry is an error whether the
  // lock is merely stale or entirely absent (fresh init never installed, or
  // `add`'s TOCTOU window leaving an edited config with no lock).
  for (const name of Object.keys(config.deps)) {
    if (!lockNames.has(name)) {
      issues.push({
        file: CONFIG_FILENAME,
        check: 'vendored-lock',
        severity: 'error',
        message: `"${name}" is declared in ${CONFIG_FILENAME} but not locked — run \`llmwiki install\``,
      });
    }
  }

  for (const [name, entry] of lock ? Object.entries(lock.bundles) : []) {
    if (!dirNames.has(name)) continue; // already flagged above

    const destRoot = join(depsDir, ...name.split('/'));
    if (lstatSync(destRoot).isSymbolicLink()) continue; // mode: link — content is the producer's, nothing to verify

    let resolved: Resolved;
    try {
      resolved = resolveProducer(repoRoot, name, entry);
    } catch {
      issues.push({
        file: `${root}/deps/${name}`,
        check: 'vendored-lock',
        severity: 'warning',
        message: `cannot verify vendored bundle "${name}" — dependency not installed`,
      });
      continue;
    }

    const upstreamRoot = join(resolved.absDir, resolved.producerRoot);
    if (hashBundle(upstreamRoot) !== entry.upstreamHash) {
      issues.push({
        file: `${root}/deps/${name}`,
        check: 'vendored-lock',
        severity: 'error',
        message: `lock is stale for "${name}" — run \`llmwiki install\``,
      });
      continue;
    }

    for (const rel of vendorableFiles(upstreamRoot)) {
      const src = join(upstreamRoot, rel);
      const dest = join(destRoot, rel);
      const mismatched = rel.endsWith('.md')
        ? !existsSync(dest) ||
          readFileSync(dest, 'utf-8') !==
            rewritePage(readFileSync(src, 'utf-8'), {
              producerRoot: resolved.producerRoot,
              consumerRoot: root,
              bundleName: name,
            }).content
        : !existsSync(dest) || !readFileSync(dest).equals(readFileSync(src));
      if (mismatched) {
        issues.push({
          file: `${root}/deps/${name}/${rel}`,
          check: 'vendored-lock',
          severity: 'error',
          message: `${root}/deps/${name}/${rel} differs from what install would produce — vendored trees are read-only`,
        });
        break; // first mismatch only — the point is proven
      }
    }
  }

  return issues;
};
