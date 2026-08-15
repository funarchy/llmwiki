import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig, CONFIG_FILENAME } from '../config.js';
import type { DepSpec, ResolvedBundle } from '../types.js';

export type Resolved = Omit<ResolvedBundle, 'requiredBy'>;

/** Resolve a `path:` dep. `baseDir` is the directory the path is relative to. */
export function resolvePathDep(baseDir: string, name: string, spec: DepSpec): Resolved {
  const absDir = resolve(baseDir, spec.path!);
  if (!existsSync(join(absDir, CONFIG_FILENAME))) {
    throw new Error(
      `Dependency "${name}" at ${absDir} ships no knowledge bundle (no ${CONFIG_FILENAME}). ` +
        `The wiki-vendor skill is the supported path for a dependency without one.`,
    );
  }
  const config = loadConfig(absDir);
  const pkgPath = join(absDir, 'package.json');
  const pkg = existsSync(pkgPath)
    ? (JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: string; version?: string })
    : {};
  const version = pkg.version ?? config.bundle.version;
  if (!version) {
    throw new Error(`Dependency "${name}" at ${absDir} declares no version (package.json or bundle.version).`);
  }
  if (!existsSync(join(absDir, config.bundle.root))) {
    throw new Error(`Dependency "${name}": bundle root ${config.bundle.root} not found in ${absDir}.`);
  }
  return {
    name,
    version,
    source: 'path',
    absDir,
    producerRoot: config.bundle.root,
    declaredDeps: config.deps,
  };
}
