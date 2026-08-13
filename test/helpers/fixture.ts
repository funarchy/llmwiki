import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Build a temporary repo from a map of repo-relative paths to file contents.
 * Returns the repo root.
 */
export function makeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'llmwiki-fx-'));
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(root, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

/** Minimal valid llmwiki.yaml body for a given bundle root. */
export function configYaml(root = 'llmwiki'): string {
  return `version: 1\nbundle:\n  root: ${root}\n`;
}

/** A conformant concept page. */
export function page(title: string, extra = ''): string {
  return [
    '---',
    'type: topic',
    `title: ${title}`,
    `description: What ${title} is and how to use it here`,
    'sources:',
    '  - src/example.ts',
    '---',
    '',
    `${title} answers one question.`,
    extra,
  ].join('\n');
}
