import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { page } from './fixture.js';

export interface ProducerSpec {
  /** Package name, e.g. '@funarchy/scenepad'. */
  name: string;
  version?: string;
  /** Producer's bundle root name. Default 'wiki'. */
  root?: string;
  /** Extra wiki-sticky.yaml lines, e.g. deps. */
  configExtra?: string;
  /** Files relative to the bundle root. Defaults give a minimal valid bundle. */
  files?: Record<string, string>;
  /** Omit wiki-sticky.yaml entirely (a package with no bundle). */
  noBundle?: boolean;
}

/** Write a producer package into `dir` (e.g. <repo>/node_modules/<name>). */
export function writeProducer(dir: string, spec: ProducerSpec): void {
  const root = spec.root ?? 'wiki';
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify({ name: spec.name, version: spec.version ?? '1.0.0' }, null, 2)}\n`,
  );
  if (spec.noBundle) return;
  writeFileSync(join(dir, 'wiki-sticky.yaml'), `version: 1\nbundle:\n  root: ${root}\n${spec.configExtra ?? ''}`);
  const files = spec.files ?? {
    'index.md': `# ${spec.name}\n\n* [Topic](/${root}/topic.md) - the one topic\n`,
    'topic.md': page('Topic'),
  };
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
}
