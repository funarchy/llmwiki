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

export function formatErrors(errors: ErrorObject[] | null | undefined): string {
  const all = errors ?? [];
  // Inside a `oneOf`, ajv reports every branch's failure — including branches the
  // user never wrote. Prefer the substantive errors, and fall back to everything
  // when structure is all there is (so a bad `version:` still reports something).
  const substantive = all.filter((e) => !STRUCTURAL_KEYWORDS.has(e.keyword));
  const chosen = substantive.length > 0 ? substantive : all;
  return [...new Set(chosen.map(describeError))].join('; ');
}
