import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Build a temporary repo from a map of repo-relative paths to file contents.
 * Returns the repo root.
 */
export function makeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'wiki-sticky-fx-'));
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(root, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

/** Minimal valid wiki-sticky.yaml body for a given bundle root. */
export function configYaml(root = 'wiki'): string {
  return `version: 1\nbundle:\n  root: ${root}\n`;
}

/** A conformant concept page. */
export function page(title: string, extra = ''): string {
  return [
    '---',
    'type: topic',
    // Quoted, not interpolated raw: eight test files import this helper, and a title
    // containing `:` or `[` would otherwise silently produce different YAML structure
    // rather than a clear failure — a confusing break far from its cause.
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(`What ${title} is and how to use it here`)}`,
    'sources:',
    '  - src/example.ts',
    '---',
    '',
    `${title} answers one question.`,
    extra,
  ].join('\n');
}
