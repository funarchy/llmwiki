import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_FILENAME } from '../config.js';
import { resolvePathDep, type Resolved } from './path.js';

export interface NpmResolution {
  resolved: Resolved;
  /** Set when a nested copy was shadowed by the top-level one (§8). */
  warning?: string;
}

/**
 * Resolve an npm dep. Consumer top-level `node_modules` wins; the requirer's
 * nested `node_modules` is the fallback. When both exist at different
 * versions, top-level wins with a loud warning (§8).
 */
export function resolveNpmDep(repoRoot: string, requirerDir: string | null, name: string): NpmResolution {
  const top = join(repoRoot, 'node_modules', ...name.split('/'));
  const nested = requirerDir ? join(requirerDir, 'node_modules', ...name.split('/')) : null;
  const topExists = existsSync(top);
  const nestedExists = nested !== null && existsSync(nested);

  if (!topExists && !nestedExists) {
    throw new Error(`Dependency "${name}" is not installed — run your package manager first.`);
  }
  const dir = topExists ? top : (nested as string);
  if (!existsSync(join(dir, CONFIG_FILENAME))) {
    throw new Error(
      `Dependency "${name}" ships no knowledge bundle (no ${CONFIG_FILENAME}). ` +
        `The wiki-vendor skill is the supported path for a dependency without one.`,
    );
  }
  // Identity + bundle come from the same logic as a path dep at that directory.
  const resolved = { ...resolvePathDep(dir, name, { source: 'path', path: '.' }), source: 'npm' as const };

  let warning: string | undefined;
  if (topExists && nestedExists) {
    const nestedResolved = resolvePathDep(nested as string, name, { source: 'path', path: '.' });
    if (nestedResolved.version !== resolved.version) {
      warning =
        `"${name}" exists at top-level (v${resolved.version}) and nested under the requirer ` +
        `(v${nestedResolved.version}); using top-level.`;
    }
  }
  return { resolved, warning };
}
