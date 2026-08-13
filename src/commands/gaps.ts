import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadBundle, isConceptPage } from '../bundle/load.js';
import { findRepoRoot, loadConfig } from '../config.js';
import { parseFrontmatter } from '../md/frontmatter.js';
import { stripCode } from '../md/links.js';

export interface EvalGap {
  question: string;
  pagesNeeded: string[];
}

export interface StubPage {
  title: string;
  repoPath: string;
}

export interface Gaps {
  evalGaps: EvalGap[];
  stubs: StubPage[];
}

const STUB_MARKER = '**Stub.**';

export function collectGaps(repoRoot: string, bundleRoot: string): Gaps {
  const evalDir = join(repoRoot, bundleRoot, '_meta', 'eval');
  const evalGaps: EvalGap[] = [];

  if (existsSync(evalDir)) {
    const entries = readdirSync(evalDir, { withFileTypes: true })
      .filter((dirent) => dirent.isFile())
      .map((dirent) => dirent.name)
      .sort();
    for (const entry of entries) {
      if (!entry.endsWith('.md') || entry === 'index.md') continue;
      const { frontmatter } = parseFrontmatter(readFileSync(join(evalDir, entry), 'utf-8'));
      if (!frontmatter || frontmatter.status !== 'to_resolve') continue;
      evalGaps.push({
        question: String(frontmatter.question ?? entry),
        pagesNeeded: Array.isArray(frontmatter['pages-needed'])
          ? (frontmatter['pages-needed'] as unknown[]).map(String)
          : [],
      });
    }
  }

  const bundle = loadBundle(repoRoot, bundleRoot);
  const stubs: StubPage[] = bundle.pages
    .filter((page) => isConceptPage(page, bundle) && stripCode(page.body).includes(STUB_MARKER))
    .map((page) => ({
      title: String(page.frontmatter?.title ?? page.repoPath),
      repoPath: page.repoPath,
    }));

  return { evalGaps, stubs };
}

export function formatGaps(gaps: Gaps): string {
  const lines: string[] = ['## Open gaps', ''];

  if (gaps.evalGaps.length === 0) {
    lines.push('(none)');
  } else {
    gaps.evalGaps.forEach((gap, i) => {
      lines.push(`${i + 1}. ${gap.question.replace(/\s+/g, ' ')}`);
      if (gap.pagesNeeded.length === 0) {
        lines.push('   (no new pages needed — an existing page needs updating, or re-run the eval)');
      } else {
        lines.push('   Pages needed:');
        for (const needed of gap.pagesNeeded) lines.push(`   - ${needed}`);
      }
    });
  }

  lines.push('', '## Wiki pages that need content', '');

  if (gaps.stubs.length === 0) {
    lines.push('(none)');
  } else {
    for (const stub of gaps.stubs) lines.push(`- ${stub.title} - ${stub.repoPath}`);
  }

  return lines.join('\n');
}

export function gapsCommand(cwd: string): number {
  const repoRoot = findRepoRoot(cwd);
  if (!repoRoot) {
    throw new Error('No llmwiki.yaml found in this directory or any parent — run `llmwiki init` first.');
  }
  const config = loadConfig(repoRoot);
  console.log(formatGaps(collectGaps(repoRoot, config.bundle.root)));
  return 0;
}
