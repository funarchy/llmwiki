/** Frontmatter of a page. OKF requires consumers to tolerate unknown keys. */
export interface Frontmatter {
  $schema?: string;
  type?: string;
  title?: string;
  description?: string;
  tags?: string[];
  sources?: string[];
  okf_version?: string;
  [key: string]: unknown;
}

/**
 * What a page's frontmatter delimiter block contained.
 * - `absent`  — no delimited block: no opening `---`, or it was never closed
 * - `empty`   — a block was present but held nothing
 * - `invalid` — a block was present but its YAML would not parse, or was not a mapping
 * - `parsed`  — a block was present and yielded a mapping
 */
export type FrontmatterState = 'absent' | 'empty' | 'invalid' | 'parsed';

/** A link found in a page body. */
export interface Link {
  /** Ref name for a reference definition; undefined for an inline link. */
  ref?: string;
  /** Href as written, with any `#fragment` stripped. */
  href: string;
  /** 1-based line number in the source file. */
  line: number;
  style: 'inline' | 'reference-definition';
}

export interface Page {
  /** Absolute path on disk. */
  absPath: string;
  /** Path from the repo root, forward slashes, no leading slash: `llmwiki/data/mongo.md`. */
  repoPath: string;
  isIndex: boolean;
  frontmatter: Frontmatter | null;
  frontmatterState: FrontmatterState;
  body: string;
  links: Link[];
}

export interface Bundle {
  /** Absolute path to the bundle root directory. */
  absRoot: string;
  /** Bundle root from the repo root, no leading slash: `llmwiki`. */
  root: string;
  pages: Page[];
}

export interface Issue {
  /** Repo-relative path of the file or directory the issue concerns. */
  file: string;
  line?: number;
  /** Check identifier, e.g. `kebab-case`. */
  check: string;
  message: string;
  severity: 'error' | 'warning';
}

export type DepSource = 'npm' | 'path' | 'git';

export interface DepSpec {
  source: DepSource;
  path?: string;
  url?: string;
  ref?: string;
}

export interface VendorSpec {
  from: string;
}

export interface Config {
  version: 1;
  bundle: { root: string; name?: string; version?: string };
  deps: Record<string, DepSpec>;
  vendor: Record<string, VendorSpec>;
  skills: 'managed' | 'vendored' | 'off';
  mode: 'copy' | 'link';
}

/** A dependency bundle after resolution, before vendoring. */
export interface ResolvedBundle {
  name: string;
  version: string;
  source: DepSource;
  /** Absolute directory of the producing package (its repo root). */
  absDir: string;
  /** The producer's bundle root, relative to absDir. */
  producerRoot: string;
  /** Deps the producer declares in its own llmwiki.yaml. */
  declaredDeps: Record<string, DepSpec>;
  /** Requirers: '.' is the consumer itself. */
  requiredBy: string[];
}

export interface LockBundle {
  source: DepSource;
  version: string;
  /** Where resolution found it, repo-relative posix for npm, the config path for path deps. */
  resolvedFrom: string;
  /** sha256 over the producer's vendorable content, before rewriting. */
  upstreamHash: string;
  requiredBy: string[];
}

export interface Lock {
  version: 1;
  bundles: Record<string, LockBundle>;
  /** Skill hashes — written by Plan 3; carried as-is here. */
  skills: Record<string, string>;
}
