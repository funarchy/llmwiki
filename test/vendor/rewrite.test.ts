import { describe, it, expect } from 'vitest';
import { rewritePage } from '../../src/vendor/rewrite.js';

const opts = {
  producerRoot: 'wiki',
  consumerRoot: 'wiki',
  bundleName: '@x/scenepad',
};

describe('rewritePage', () => {
  it('rewrites the producer own-page href, and does not double-edit a ref-def line that also looks like an inline link', () => {
    const { content, warnings } = rewritePage('[a]: /wiki/pms/traits.md\n', opts);
    expect(content).toBe('[a]: /wiki/deps/@x/scenepad/pms/traits.md\n');
    expect(warnings).toEqual([]);

    // Watch item 2: a ref-def line whose trailing text also looks like an inline
    // link must take the ref-def branch only — the embedded "link" is untouched.
    const { content: mixed } = rewritePage('[a]: /wiki/x.md "see [b](/wiki/y.md) also"\n', opts);
    expect(mixed).toBe('[a]: /wiki/deps/@x/scenepad/x.md "see [b](/wiki/y.md) also"\n');

    // Verify offset-exactness on an indented reference definition (up to 3
    // leading spaces are valid per CommonMark).
    const { content: indented } = rewritePage('   [a]: /wiki/x.md\n', opts);
    expect(indented).toBe('   [a]: /wiki/deps/@x/scenepad/x.md\n');
  });

  it('rewrites a cross-bundle href flat, not nested, and treats a same-named directory as a non-boundary', () => {
    const { content, warnings } = rewritePage('[k]: /wiki/deps/@x/koota/traits.md\n', opts);
    expect(content).toBe('[k]: /wiki/deps/@x/koota/traits.md\n');
    expect(warnings).toEqual([]);

    // Watch item 4: '/wiki/depsfoo/...' is a directory named "depsfoo", not the
    // producer's deps/ tree — must be treated as an ordinary own-page href.
    const { content: notDeps } = rewritePage('[d]: /wiki/depsfoo/x.md\n', opts);
    expect(notDeps).toBe('[d]: /wiki/deps/@x/scenepad/depsfoo/x.md\n');
  });

  it('leaves a producer vendor/ link unchanged with a warning', () => {
    const { content, warnings } = rewritePage('[v]: /wiki/vendor/react-native/hooks.md\n', opts);
    expect(content).toBe('[v]: /wiki/vendor/react-native/hooks.md\n');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/vendor\//);
  });

  it('leaves a bare producer vendor href unchanged with a warning', () => {
    const { content, warnings } = rewritePage('[v]: /wiki/vendor\n', opts);
    expect(content).toBe('[v]: /wiki/vendor\n');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/vendor\//);
  });

  it('rewrites a bare producer deps href to the bare consumer deps form', () => {
    const { content, warnings } = rewritePage('[b]: /wiki/deps\n', opts);
    expect(content).toBe('[b]: /wiki/deps\n');
    expect(warnings).toEqual([]);
  });

  it('leaves a href outside the producer bundle root unchanged with a warning', () => {
    const { content, warnings } = rewritePage('[s]: /src/foo.ts\n', opts);
    expect(content).toBe('[s]: /src/foo.ts\n');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/outside the producer/);
  });

  it('preserves the fragment', () => {
    const { content } = rewritePage('[a]: /wiki/a.md#s\n', opts);
    expect(content).toBe('[a]: /wiki/deps/@x/scenepad/a.md#s\n');
  });

  it('rewrites an inline link in an index body', () => {
    const { content, warnings } = rewritePage('* [Topic](/wiki/topic.md) - the one topic\n', opts);
    expect(content).toBe('* [Topic](/wiki/deps/@x/scenepad/topic.md) - the one topic\n');
    expect(warnings).toEqual([]);
  });

  it('leaves an href inside a code fence untouched', () => {
    const input = ['```', '[a]: /wiki/pms/traits.md', '```', ''].join('\n');
    const { content, warnings } = rewritePage(input, opts);
    expect(content).toBe(input);
    expect(warnings).toEqual([]);
  });

  it('warns on an unclosed code fence and still rewrites the link-shaped text after it (recorded behaviour)', () => {
    const input = ['```', 'not really code', '[a]: /wiki/pms/traits.md', ''].join('\n');
    const { content, warnings } = rewritePage(input, opts);
    expect(content).toContain('[a]: /wiki/deps/@x/scenepad/pms/traits.md');
    expect(warnings).toContain('unclosed code fence — link-shaped text after it is rewritten as prose');
  });

  it('leaves a relative href untouched with no warning', () => {
    const { content, warnings } = rewritePage('[r]: ./relative.md\n', opts);
    expect(content).toBe('[r]: ./relative.md\n');
    expect(warnings).toEqual([]);
  });

  it('leaves an external URL untouched with no warning', () => {
    const { content, warnings } = rewritePage('[e]: https://example.com/x\n', opts);
    expect(content).toBe('[e]: https://example.com/x\n');
    expect(warnings).toEqual([]);
  });

  it('matching roots: own-page hrefs still gain the deps/<name> segment, while cross-bundle hrefs are the actual no-op', () => {
    const sameRootOpts = { producerRoot: 'wiki', consumerRoot: 'wiki', bundleName: '@x/scenepad' };
    const { content: ownPage, warnings: w1 } = rewritePage('[a]: /wiki/pms/traits.md\n', sameRootOpts);
    expect(ownPage).toBe('[a]: /wiki/deps/@x/scenepad/pms/traits.md\n');
    expect(w1).toEqual([]);

    const { content: crossBundle, warnings: w2 } = rewritePage('[k]: /wiki/deps/@x/koota/traits.md\n', sameRootOpts);
    expect(crossBundle).toBe('[k]: /wiki/deps/@x/koota/traits.md\n');
    expect(w2).toEqual([]);
  });

  it('depth-independence: the same footer rewrites identically regardless of surrounding content', () => {
    const footer = '[a]: /wiki/pms/traits.md\n';
    const shallow = rewritePage(footer, opts);
    const deep = rewritePage(`# Title\n\nSome prose.\n\nMore prose here.\n\n${footer}`, opts);
    const deepFooterLine = deep.content.split('\n').find((l) => l.startsWith('[a]:'));
    const shallowFooterLine = shallow.content.split('\n').find((l) => l.startsWith('[a]:'));
    expect(deepFooterLine).toBe(shallowFooterLine);
  });

  it('normalizes CRLF input and still rewrites', () => {
    const { content } = rewritePage('[a]: /wiki/pms/traits.md\r\n', opts);
    expect(content).toBe('[a]: /wiki/deps/@x/scenepad/pms/traits.md\n');
  });
});
