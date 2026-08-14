import { registerCheck } from '../run.js';
import { kebabCase } from './kebab-case.js';
import { frontmatterCheck } from './frontmatter.js';
import { indexFrontmatter } from './index-frontmatter.js';
import { linksResolve } from './links-resolve.js';
import { orphans } from './orphans.js';
import { dirIndex } from './dir-index.js';
import { linkReferenceStyle } from './link-reference-style.js';
import { linkAbsolute } from './link-absolute.js';
import { vendoredLock } from './vendored-lock.js';
import { generatedIndexes } from './generated-indexes.js';
import { rootLinksDeps } from './root-links-deps.js';

/** Importing this module registers every check exactly once, in report order. */
registerCheck('kebab-case', kebabCase);
registerCheck('frontmatter', frontmatterCheck);
registerCheck('index-frontmatter', indexFrontmatter);
registerCheck('links-resolve', linksResolve);
registerCheck('orphans', orphans);
registerCheck('dir-index', dirIndex);
registerCheck('link-reference-style', linkReferenceStyle);
registerCheck('link-absolute', linkAbsolute);
registerCheck('vendored-lock', vendoredLock);
registerCheck('generated-indexes', generatedIndexes);
registerCheck('root-links-deps', rootLinksDeps);
