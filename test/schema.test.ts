import { describe, it, expect } from 'vitest';
import { compileSchema, describeError, formatErrors } from '../src/schema.js';

describe('compileSchema', () => {
  it('compiles a shipped schema and memoizes it', () => {
    const first = compileSchema('llmwiki.schema.json');
    const second = compileSchema('llmwiki.schema.json');
    expect(first).toBe(second);
    expect(first({ version: 1, bundle: { root: 'llmwiki' } })).toBe(true);
  });

  it('reports validation failures on the compiled function', () => {
    const validate = compileSchema('llmwiki.schema.json');
    expect(validate({ version: 1 })).toBe(false);
    expect(formatErrors(validate.errors)).toMatch(/bundle/);
  });
});

describe('describeError', () => {
  it('names a missing required field', () => {
    expect(
      describeError({ keyword: 'required', instancePath: '', schemaPath: '', params: { missingProperty: 'bundle' } }),
    ).toBe('missing required field: bundle');
  });

  it('names an unknown field', () => {
    expect(
      describeError({
        keyword: 'additionalProperties',
        instancePath: '',
        schemaPath: '',
        params: { additionalProperty: 'nonsense' },
      }),
    ).toBe('unknown field: nonsense');
  });

  it('lists the allowed values for an enum violation', () => {
    expect(
      describeError({
        keyword: 'enum',
        instancePath: '/skills',
        schemaPath: '',
        params: { allowedValues: ['managed', 'vendored', 'off'] },
      }),
    ).toBe('/skills must be one of: managed, vendored, off');
  });

  it('falls back to the instance path and message', () => {
    expect(
      describeError({
        keyword: 'minLength',
        instancePath: '/description',
        schemaPath: '',
        params: {},
        message: 'must NOT have fewer than 10 characters',
      }),
    ).toBe('/description must NOT have fewer than 10 characters');
  });
});
