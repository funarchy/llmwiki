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
  return `${error.instancePath || '(root)'} ${error.message}`;
}

export function formatErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? []).map(describeError).join('; ');
}
