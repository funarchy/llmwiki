import { resolveNpmDep } from './npm.js';
import { resolvePathDep, type Resolved } from './path.js';
import type { Config, DepSpec, ResolvedBundle } from '../types.js';

export class ConflictError extends Error {}
export class CycleError extends Error {}

export interface GraphResult {
  /** Flat, deduped, sorted by name. */
  bundles: ResolvedBundle[];
  warnings: string[];
}

interface QueueItem {
  name: string;
  spec: DepSpec;
  /** '.' for the consumer, else the requiring bundle's name. */
  requirer: string;
  /** Directory `path:` specs resolve against; requirer's absDir for transitive deps. */
  baseDir: string;
  /** Requirer's absDir for nested node_modules fallback; null for the consumer. */
  requirerDir: string | null;
}

/**
 * Resolve the full dependency graph, flat (§7.3). Two bundles with the same
 * name must resolve to the same version — knowledge does not tolerate two
 * truths in one tree (§8) — except that a nested npm copy shadowed by
 * top-level is a warning, handled inside resolveNpmDep. Cycles are rejected:
 * nothing else stops two bundles declaring each other.
 */
export function resolveGraph(repoRoot: string, config: Config): GraphResult {
  const byName = new Map<string, ResolvedBundle>();
  const warnings: string[] = [];
  const queue: QueueItem[] = Object.entries(config.deps).map(([name, spec]) => ({
    name,
    spec,
    requirer: '.',
    baseDir: repoRoot,
    requirerDir: null,
  }));

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.spec.source === 'git') {
      throw new Error(`Dependency "${item.name}": git resolution is not implemented in v1.`);
    }

    const existing = byName.get(item.name);
    if (existing) {
      // Already resolved: verify the same version is wanted, merge requirers.
      const again = resolveOne(repoRoot, item);
      if (again.resolved.version !== existing.version) {
        throw new ConflictError(
          `Version conflict for "${item.name}": v${existing.version} (required by ${existing.requiredBy.join(', ')}) ` +
            `vs v${again.resolved.version} (required by ${item.requirer}). ` +
            `Two versions of the same knowledge cannot coexist in one tree — align the requirers.`,
        );
      }
      if (!existing.requiredBy.includes(item.requirer)) existing.requiredBy.push(item.requirer);
      continue;
    }

    const { resolved, warning } = resolveOne(repoRoot, item);
    if (warning) warnings.push(warning);
    byName.set(item.name, { ...resolved, requiredBy: [item.requirer] });
    for (const [depName, depSpec] of Object.entries(resolved.declaredDeps)) {
      queue.push({
        name: depName,
        spec: depSpec,
        requirer: item.name,
        baseDir: resolved.absDir,
        requirerDir: resolved.absDir,
      });
    }
  }

  detectCycles(config, byName);
  return { bundles: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)), warnings };
}

function resolveOne(repoRoot: string, item: QueueItem): { resolved: Resolved; warning?: string } {
  if (item.spec.source === 'path') {
    return { resolved: resolvePathDep(item.baseDir, item.name, item.spec) };
  }
  return resolveNpmDep(repoRoot, item.requirerDir, item.name);
}

/** DFS over name → declared-dep-name edges, '.' included as the root. */
function detectCycles(config: Config, byName: Map<string, ResolvedBundle>): void {
  const edges = new Map<string, string[]>([['.', Object.keys(config.deps)]]);
  for (const [name, bundle] of byName) edges.set(name, Object.keys(bundle.declaredDeps));

  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (node: string, path: string[]) => {
    if (done.has(node)) return;
    if (visiting.has(node)) {
      const cycle = [...path.slice(path.indexOf(node)), node].join(' → ');
      throw new CycleError(`Dependency cycle: ${cycle}. A bundle cannot require its own consumer.`);
    }
    visiting.add(node);
    for (const next of edges.get(node) ?? []) visit(next, [...path, node]);
    visiting.delete(node);
    done.add(node);
  };
  visit('.', []);
}
