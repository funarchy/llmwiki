import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv';
import { packageRoot } from './paths.js';

const cache = new Map<string, ValidateFunction>();

/** Compile a schema from the package's schemas/ directory, memoized by filename. */
export function compileSchema(filename: string): ValidateFunction {
  const cached = cache.get(filename);
  if (cached) return cached;

  const schema = JSON.parse(readFileSync(join(packageRoot(), 'schemas', filename), 'utf-8'));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  cache.set(filename, validate);
  return validate;
}

/** One-line, human-readable description of a single ajv error. */
export function describeError(error: ErrorObject): string {
  if (error.keyword === 'required') {
    return `missing required field: ${(error.params as { missingProperty: string }).missingProperty}`;
  }
  if (error.keyword === 'additionalProperties') {
    return `unknown field: ${(error.params as { additionalProperty: string }).additionalProperty}`;
  }
  // ajv already computed the allowed values; dropping them would leave the user
  // reading "must be equal to one of the allowed values" with no list.
  if (error.keyword === 'enum') {
    const allowed = (error.params as { allowedValues?: unknown[] }).allowedValues ?? [];
    return `${error.instancePath || '(root)'} must be one of: ${allowed.join(', ')}`;
  }
  if (error.keyword === 'const') {
    const allowed = (error.params as { allowedValue?: unknown }).allowedValue;
    return `${error.instancePath || '(root)'} must be exactly ${JSON.stringify(allowed)}`;
  }
  return `${error.instancePath || '(root)'} ${error.message}`;
}

/** Keywords describing schema *structure* rather than the user's actual mistake. */
const STRUCTURAL_KEYWORDS = new Set(['oneOf', 'anyOf', 'allOf', 'if', 'not', 'const']);

/**
 * Drop errors that describe schema structure rather than a real mistake.
 *
 * Inside a `oneOf`, ajv reports every branch's failure — including branches the
 * user never wrote. Falls back to everything when structure is all there is, so a
 * bad `version:` still reports something.
 *
 * This is the single owner of that filtering. Per-error consumers — the page
 * frontmatter check emits one `Issue` per error rather than one joined string —
 * must go through here too, or they reintroduce the noise the moment a schema
 * grows its first union.
 */
export function substantiveErrors(errors: ErrorObject[] | null | undefined): ErrorObject[] {
  const all = errors ?? [];
  const substantive = all.filter((e) => !STRUCTURAL_KEYWORDS.has(e.keyword));
  return substantive.length > 0 ? substantive : all;
}

export function formatErrors(errors: ErrorObject[] | null | undefined): string {
  return [...new Set(substantiveErrors(errors).map(describeError))].join('; ');
}
