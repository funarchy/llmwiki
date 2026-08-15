import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Root of the installed llmwiki package — the directory holding `schemas/`
 * and `templates/`. Works from both `src/` (tests) and `dist/` (published),
 * since both sit one level below the package root.
 */
export function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}
