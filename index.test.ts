// ─────────────────────────────────────────────────────────────────────────────
// braces v2 — Test Suite
//
// Testing philosophy:
//   - Every public API surface has direct tests
//   - Every security concern has a dedicated test block
//   - Edge cases are documented with a comment explaining WHY they matter
//   - Shared state between tests is avoided (clearCache in beforeEach)
//   - Tests are named as behaviour specifications, not implementation details
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  render, precompile, renderToStream, clearCache, getCacheSize,
  createRenderer, escapeHtml, escapeAttr, BUILT_IN_FILTERS, BracesError,
} from '../src/index.js';

// ═════════════════════════════════════════════════════════════════════════════
// 1. Core render() — basic interpolation
// ═════════════════════════════════════════════════════════════════════════════

describe('render(): basic interpolation', () => {
  beforeEach(clearCache);

  it('replaces a single placeholder', () => {
    expect(render('Hello {name}', { name: 'World' })).toBe('Hello World');
  });

  it('replaces multiple placeholders', () => {
    expect(
      render('{greeting}, {name}! You are {age} years old.', {
        greeting: 'Hi', name: 'Alice', age: 30,
      })
    ).toBe('Hi, Alice! You are 30 years old.');
  });

  it('replaces the same placeholder multiple times', () => {
    expect(render('{x} + {x} = {x}{x}', { x: '2' })).toBe('2 + 2 = 22');
  });

  it('returns template unchanged when no delimiter found (fast path)', () => {
    const t = 'No placeholders here';
    expect(render(t)).toBe(t);
  });

  it('handles numeric values (including 0)', () => {
    expect(render('{n}', { n: 0 })).toBe('0');
    expect(render('{n}', { n: 42 })).toBe('42');
    expect(render('{n}', { n: -7 })).toBe('-7');
  });

  it('handles boolean values (false is not empty)', () => {
    expect(render('{flag}', { flag: false })).toBe('false');
    expect(render('{flag}', { flag: true  })).toBe('true');
  });

  it('returns empty string for null and undefined', () => {
    expect(render('{x}', { x: null      })).toBe('');
    expect(render('{x}', { x: undefined })).toBe('');
  });

  it('returns empty string for NaN', () => {
    expect(render('{x}', { x: NaN })).toBe('');
  });

  it('handles whitespace inside placeholder braces', () => {
    expect(render('Hello { name }', { name: 'Alice' })).toBe('Hello Alice');
    expect(render('Hello {  name  }', { name: 'Alice' })).toBe('Hello Alice');
  });

  it('handles adjacent placeholders with no separator', () => {
    expect(render('{a}{b}{c}', { a: '1', b: '2', c: '3' })).toBe('123');
  });

  it('handles empty template string', () => {
    expect(render('', {})).toBe('');
  });

  it('handles template that IS a single placeholder', () => {
    expect(render('{x}', { x: 'hello' })).toBe('hello');
  });

  it('preserves empty placeholder {} as literal text', () => {
    expect(render('{}', {})).toBe('{}');
  });

  it('handles unicode in template and values', () => {
    expect(render('مرحبا {name}', { name: '世界' })).toBe('مرحبا 世界');
  });

  it('handles emoji in values', () => {
    expect(render('{mood}', { mood: '🚀' })).toBe('🚀');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Nested object paths
// ═════════════════════════════════════════════════════════════════════════════

describe('render(): nested object paths', () => {
  it('resolves one level deep', () => {
    expect(render('{user.name}', { user: { name: 'Bob' } })).toBe('Bob');
  });

  it('resolves four levels deep', () => {
    const data = { a: { b: { c: { d: 'deep' } } } };
    expect(render('{a.b.c.d}', data)).toBe('deep');
  });

  it('returns empty string for missing intermediate key', () => {
    expect(render('{user.address.city}', { user: {} })).toBe('');
  });

  it('returns empty string when root key is missing', () => {
    expect(render('{missing.nested}', {})).toBe('');
  });

  it('handles null at any point in the path gracefully', () => {
    expect(render('{a.b.c}', { a: null })).toBe('');
  });

  it('handles undefined mid-path gracefully', () => {
    expect(render('{a.b.c}', { a: { b: undefined } })).toBe('');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Array access
// ═════════════════════════════════════════════════════════════════════════════

describe('render(): array access', () => {
  it('accesses first element', () => {
    expect(render('{items[0]}', { items: ['alpha', 'beta'] })).toBe('alpha');
  });

  it('accesses an arbitrary index', () => {
    expect(render('{items[2]}', { items: ['a', 'b', 'c'] })).toBe('c');
  });

  it('handles out-of-bounds index gracefully', () => {
    expect(render('{items[99]}', { items: ['only one'] })).toBe('');
  });

  it('chains array index + dot notation', () => {
    const data = { users: [{ name: 'Carol' }, { name: 'Dave' }] };
    expect(render('{users[1].name}', data)).toBe('Dave');
  });

  it('handles nested array access', () => {
    const data = { matrix: [[1, 2], [3, 4]] };
    expect(render('{matrix[1][0]}', data)).toBe('3');
  });

  it('does NOT treat leading-zero strings as array indices', () => {
    // "01" is a string key, not index 1
    const data = { obj: { '01': 'string-key' } };
    expect(render('{obj[01]}', data)).toBe('');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Default values
// ═════════════════════════════════════════════════════════════════════════════

describe('render(): default values', () => {
  it('uses default when key is missing', () => {
    expect(render('Hello {name:Guest}', {})).toBe('Hello Guest');
  });

  it('uses actual value when key exists and is non-null', () => {
    expect(render('Hello {name:Guest}', { name: 'Alice' })).toBe('Hello Alice');
  });

  it('uses default when value is null', () => {
    expect(render('{x:fallback}', { x: null })).toBe('fallback');
  });

  it('uses default when value is undefined', () => {
    expect(render('{x:fallback}', { x: undefined })).toBe('fallback');
  });

  it('uses default for missing nested path', () => {
    expect(render('{user.name:Anonymous}', {})).toBe('Anonymous');
  });

  it('supports empty string as explicit default', () => {
    expect(render('[{x:}]', {})).toBe('[]');
  });

  it('preserves colons in default values (URL-safe)', () => {
    expect(render('{link:https://example.com/path?a=1}', {}))
      .toBe('https://example.com/path?a=1');
  });

  it('supports spaces in default values', () => {
    expect(render('{label:Click me now}', {})).toBe('Click me now');
  });

  // Important: 0 and false are real values, NOT treated as missing
  it('does NOT use default for 0 (falsy ≠ missing)', () => {
    expect(render('{n:99}', { n: 0 })).toBe('0');
  });

  it('does NOT use default for false (falsy ≠ missing)', () => {
    expect(render('{flag:yes}', { flag: false })).toBe('false');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Function values
// ═════════════════════════════════════════════════════════════════════════════

describe('render(): function values', () => {
  it('auto-invokes a function and uses its return value', () => {
    expect(render('{val}', { val: () => 'computed' })).toBe('computed');
  });

  it('auto-invokes nested function values', () => {
    expect(render('{user.label}', { user: { label: () => 'Dynamic' } })).toBe('Dynamic');
  });

  it('handles function returning null (uses default)', () => {
    expect(render('{x:fallback}', { x: () => null })).toBe('fallback');
  });

  it('handles function returning 0 (not empty)', () => {
    expect(render('{n}', { n: () => 0 })).toBe('0');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. Filter pipe system (NEW in v2)
// ═════════════════════════════════════════════════════════════════════════════

describe('render(): built-in filters', () => {
  it('applies |upper filter', () => {
    expect(render('{name|upper}', { name: 'alice' })).toBe('ALICE');
  });

  it('applies |lower filter', () => {
    expect(render('{name|lower}', { name: 'ALICE' })).toBe('alice');
  });

  it('applies |trim filter', () => {
    expect(render('{name|trim}', { name: '  alice  ' })).toBe('alice');
  });

  it('applies |capitalize filter', () => {
    expect(render('{phrase|capitalize}', { phrase: 'hello world' })).toBe('Hello World');
  });

  it('applies |slug filter', () => {
    expect(render('{title|slug}', { title: 'Hello World!' })).toBe('hello-world');
  });

  it('applies |urlencode filter', () => {
    expect(render('{q|urlencode}', { q: 'hello world & more' }))
      .toBe('hello%20world%20%26%20more');
  });

  it('applies |json filter', () => {
    expect(render('{val|json}', { val: 'hello' })).toBe('"hello"');
  });

  it('applies |reverse filter', () => {
    expect(render('{word|reverse}', { word: 'hello' })).toBe('olleh');
  });

  it('chains multiple filters left to right', () => {
    expect(render('{name|trim|upper}', { name: '  alice  ' })).toBe('ALICE');
  });

  it('chains filters and keeps default value', () => {
    expect(render('{name|upper:GUEST}', {})).toBe('GUEST');
  });

  it('applies filter to resolved value (not to default)', () => {
    // Filter runs on resolved value; if missing, default is used (unfiltered)
    expect(render('{name|upper:guest}', { name: 'alice' })).toBe('ALICE');
  });

  it('silently skips unknown filter names', () => {
    // Unknown filters don't crash — they're just no-ops
    expect(render('{name|unknown_filter}', { name: 'alice' })).toBe('alice');
  });

  it('|truncate truncates to 50 chars by default', () => {
    const long = 'a'.repeat(60);
    const result = render('{text|truncate}', { text: long });
    expect(result).toHaveLength(51); // 50 chars + ellipsis
    expect(result.endsWith('…')).toBe(true);
  });

  it('applies filters before HTML escaping', () => {
    // Escaping is always last so filters don't see escaped entities
    const result = render('{html|upper}', { html: '<b>bold</b>' }, { escapeHtml: true });
    expect(result).toBe('&lt;B&gt;BOLD&lt;/B&gt;');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. Custom delimiters
// ═════════════════════════════════════════════════════════════════════════════

describe('render(): custom delimiters', () => {
  const mustache  = { delimiters: { open: '{{', close: '}}' } } as const;
  const bracket   = { delimiters: { open: '[[', close: ']]' } } as const;
  const angle     = { delimiters: { open: '<',  close: '>'  } } as const;

  it('supports mustache-style {{ }}', () => {
    expect(render('Hi {{name}}', { name: 'Alice' }, mustache)).toBe('Hi Alice');
  });

  it('supports double-bracket delimiters', () => {
    expect(render('Hi [[name]]', { name: 'Bob' }, bracket)).toBe('Hi Bob');
  });

  it('supports single-char angle delimiters', () => {
    expect(render('<name>', { name: 'Carol' }, angle)).toBe('Carol');
  });

  it('does not replace default braces when using custom delimiters', () => {
    expect(render('{name} [[name]]', { name: 'Dave' }, bracket))
      .toBe('{name} Dave');
  });

  it('supports nested paths with custom delimiters', () => {
    expect(
      render('[[user.name]]', { user: { name: 'Eve' } }, bracket)
    ).toBe('Eve');
  });

  it('supports filters with custom delimiters', () => {
    expect(render('[[name|upper]]', { name: 'frank' }, bracket)).toBe('FRANK');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. Escaped delimiters (NEW in v2)
// ═════════════════════════════════════════════════════════════════════════════

describe('render(): escaped delimiters', () => {
  it('emits literal { when prefixed with backslash', () => {
    expect(render('Price: \\{amount}', { amount: '99' })).toBe('Price: {amount}');
  });

  it('still replaces unescaped placeholders in the same template', () => {
    expect(render('\\{raw} and {actual}', { actual: 'value' }))
      .toBe('{raw} and value');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. HTML escaping
// ═════════════════════════════════════════════════════════════════════════════

describe('render(): HTML escaping', () => {
  it('escapes & < > " \' and `', () => {
    const unsafe = '& < > " \' `';
    const result = render('{x}', { x: unsafe }, { escapeHtml: true });
    expect(result).toBe('&amp; &lt; &gt; &quot; &#x27; &#x60;');
  });

  it('neutralises a script injection attempt', () => {
    const payload = '<script>alert("xss")</script>';
    const result = render('{html}', { html: payload }, { escapeHtml: true });
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  it('does NOT escape when escapeHtml is false (default)', () => {
    expect(render('{html}', { html: '<b>bold</b>' })).toBe('<b>bold</b>');
  });

  it('escapes values after filter application', () => {
    // filter runs first, escape runs last — preventing double-escaping
    const result = render('{val|upper}', { val: '<b>hello</b>' }, { escapeHtml: true });
    expect(result).toBe('&lt;B&gt;HELLO&lt;/B&gt;');
  });
});

describe('escapeHtml() utility', () => {
  it('escapes all dangerous characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).not.toContain('<');
  });

  it('escapes backtick', () => {
    expect(escapeHtml('`')).toBe('&#x60;');
  });

  it('is a no-op on safe strings', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });
});

describe('escapeAttr() utility', () => {
  it('escapes newlines inside attribute values', async () => {
    const { escapeAttr } = await import('../src/escaper.js');
    expect(escapeAttr('line1\nline2')).toBe('line1 line2');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. Missing value modes
// ═════════════════════════════════════════════════════════════════════════════

describe('render(): missing value modes', () => {
  it('mode "silent" returns empty string (default)', () => {
    expect(render('{missing}', {}, { missing: 'silent' })).toBe('');
  });

  it('mode "warn" returns empty string and logs to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = render('{missing}', {}, { missing: 'warn' });
    expect(result).toBe('');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]?.[0]).toContain('missing');
    spy.mockRestore();
  });

  it('mode "strict" throws BracesError', () => {
    expect(() => render('{missing}', {}, { missing: 'strict' }))
      .toThrow(BracesError);
  });

  it('BracesError includes the path in its message', () => {
    expect(() => render('{user.name}', {}, { missing: 'strict' }))
      .toThrow(/user\.name/);
  });

  it('BracesError is instanceof Error', () => {
    let err: unknown;
    try { render('{x}', {}, { missing: 'strict' }); }
    catch (e) { err = e; }
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BracesError);
  });

  it('does NOT throw in strict mode when placeholder has a default', () => {
    expect(() => render('{missing:fallback}', {}, { missing: 'strict' }))
      .not.toThrow();
    expect(render('{missing:fallback}', {}, { missing: 'strict' })).toBe('fallback');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. Security — prototype pollution
// ═════════════════════════════════════════════════════════════════════════════

describe('Security: prototype pollution prevention', () => {
  it('ignores __proto__ as a root path', () => {
    expect(render('{__proto__}', {})).toBe('');
  });

  it('ignores constructor as a root path', () => {
    expect(render('{constructor}', {})).toBe('');
  });

  it('ignores prototype as a root path', () => {
    expect(render('{prototype}', {})).toBe('');
  });

  it('ignores __proto__ at any depth in a nested path', () => {
    expect(render('{safe.__proto__.evil}', { safe: {} })).toBe('');
  });

  it('does not modify Object.prototype after a poisoned path', () => {
    render('{__proto__.polluted}', {});
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('respects maxDepth to prevent runaway traversal', () => {
    const deep = 'a.b.c.d.e.f.g.h.i.j.k'; // 11 levels
    const renderer = createRenderer({ maxDepth: 5 });
    expect(renderer.render(`{${deep}}`, {})).toBe('');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. precompile()
// ═════════════════════════════════════════════════════════════════════════════

describe('precompile()', () => {
  it('returns a function', () => {
    expect(typeof precompile('Hello {name}')).toBe('function');
  });

  it('renders correctly on first call', () => {
    const fn = precompile('Hello {name}!');
    expect(fn({ name: 'Ivan' })).toBe('Hello Ivan!');
  });

  it('renders different data on subsequent calls without re-parsing', () => {
    const fn = precompile('Hi {name}!');
    expect(fn({ name: 'Jane' })).toBe('Hi Jane!');
    expect(fn({ name: 'Karl' })).toBe('Hi Karl!');
  });

  it('accepts runtime escapeHtml override', () => {
    const fn = precompile('{html}');
    expect(fn({ html: '<b>' }, { escapeHtml: true  })).toBe('&lt;b&gt;');
    expect(fn({ html: '<b>' }, { escapeHtml: false })).toBe('<b>');
  });

  it('accepts runtime missing override', () => {
    const fn = precompile('{x}');
    expect(fn({}, { missing: 'silent' })).toBe('');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13. createRenderer() — factory
// ═════════════════════════════════════════════════════════════════════════════

describe('createRenderer()', () => {
  it('creates an isolated renderer with its own cache', () => {
    const r = createRenderer();
    r.render('Hello {name}', { name: 'test' });
    expect(r.cacheSize).toBe(1);
    // Default renderer is unaffected
  });

  it('bakes in escapeHtml as a default', () => {
    const r = createRenderer({ escapeHtml: true });
    expect(r.render('{x}', { x: '<b>' })).toBe('&lt;b&gt;');
  });

  it('bakes in custom delimiters', () => {
    const r = createRenderer({ delimiters: { open: '[[', close: ']]' } });
    expect(r.render('[[name]]', { name: 'Alice' })).toBe('Alice');
    expect(r.render('{name}', { name: 'Alice' })).toBe('{name}'); // default braces untouched
  });

  it('bakes in custom filters', () => {
    const r = createRenderer({
      filters: { currency: (v) => '$' + Number(v).toFixed(2) },
    });
    expect(r.render('{price|currency}', { price: '9.99' })).toBe('$9.99');
  });

  it('custom filters override built-ins with the same name', () => {
    const r = createRenderer({
      filters: { upper: (v) => `[${v}]` },
    });
    expect(r.render('{name|upper}', { name: 'test' })).toBe('[test]');
  });

  it('clears its own cache independently', () => {
    const r = createRenderer();
    r.render('Hello {name}', { name: 'x' });
    expect(r.cacheSize).toBe(1);
    r.clearCache();
    expect(r.cacheSize).toBe(0);
  });

  it('exposes resolved options', () => {
    const r = createRenderer({ escapeHtml: true, maxDepth: 5 });
    expect(r.options.escapeHtml).toBe(true);
    expect(r.options.maxDepth).toBe(5);
  });

  it('cacheSize: 0 disables caching', () => {
    const r = createRenderer({ cacheSize: 0 });
    r.render('Hello {name}', { name: 'x' });
    expect(r.cacheSize).toBe(0);
  });

  it('supports per-call overrides that win over baked-in defaults', () => {
    const r = createRenderer({ escapeHtml: true });
    // Override to false for one call
    expect(r.render('{x}', { x: '<b>' }, { escapeHtml: false })).toBe('<b>');
  });

  it('missing mode "strict" baked in throws on every call', () => {
    const r = createRenderer({ missing: 'strict' });
    expect(() => r.render('{x}', {})).toThrow(BracesError);
  });

  it('precompile() on renderer instance uses baked-in options', () => {
    const r = createRenderer({ escapeHtml: true });
    const fn = r.precompile('{html}');
    expect(fn({ html: '<b>' })).toBe('&lt;b&gt;');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14. renderToStream() (NEW in v2)
// ═════════════════════════════════════════════════════════════════════════════

describe('renderToStream()', () => {
  async function collect(iter: AsyncIterable<string>): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of iter) chunks.push(chunk);
    return chunks.join('');
  }

  it('produces the same output as render()', async () => {
    const template = 'Hello {name}, you have {count} messages';
    const data = { name: 'Alice', count: 5 };
    const streamed = await collect(renderToStream(template, data));
    expect(streamed).toBe(render(template, data));
  });

  it('streams text-only templates as a single chunk', async () => {
    const chunks: string[] = [];
    for await (const chunk of renderToStream('No placeholders')) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('No placeholders');
  });

  it('resolves nested paths', async () => {
    const result = await collect(
      renderToStream('{user.name}', { user: { name: 'Bob' } })
    );
    expect(result).toBe('Bob');
  });

  it('applies filters in stream mode', async () => {
    const result = await collect(renderToStream('{name|upper}', { name: 'alice' }));
    expect(result).toBe('ALICE');
  });

  it('escapes HTML in stream mode', async () => {
    const result = await collect(
      renderToStream('{x}', { x: '<b>' }, { escapeHtml: true })
    );
    expect(result).toBe('&lt;b&gt;');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 15. LRU cache
// ═════════════════════════════════════════════════════════════════════════════

describe('LRU cache', () => {
  beforeEach(clearCache);

  it('getCacheSize() is 0 after clearCache()', () => {
    expect(getCacheSize()).toBe(0);
  });

  it('populates cache on first render()', () => {
    render('Hello {name}', { name: 'test' });
    expect(getCacheSize()).toBe(1);
  });

  it('reuses cache entry for same template', () => {
    render('Hello {name}', { name: 'a' });
    render('Hello {name}', { name: 'b' });
    expect(getCacheSize()).toBe(1);
  });

  it('creates separate entries for different templates', () => {
    render('Hello {name}', {});
    render('Bye {name}', {});
    expect(getCacheSize()).toBe(2);
  });
});

describe('LRUCache unit tests', () => {
  it('respects capacity and evicts LRU on overflow', async () => {
    const { LRUCache } = await import('../src/cache.js');
    const cache = new LRUCache<string, number>(3);
    cache.set('a', 1).set('b', 2).set('c', 3);
    cache.get('a'); // promote 'a' to MRU
    cache.set('d', 4); // should evict 'b' (LRU)
    expect(cache.has('b')).toBe(false);
    expect(cache.has('a')).toBe(true);
    expect(cache.size).toBe(3);
  });

  it('updates value for existing key without growing size', async () => {
    const { LRUCache } = await import('../src/cache.js');
    const cache = new LRUCache<string, number>(5);
    cache.set('a', 1);
    cache.set('a', 99);
    expect(cache.get('a')).toBe(99);
    expect(cache.size).toBe(1);
  });

  it('throws on invalid capacity', async () => {
    const { LRUCache } = await import('../src/cache.js');
    expect(() => new LRUCache(0)).toThrow(RangeError);
    expect(() => new LRUCache(-1)).toThrow(RangeError);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 16. BUILT_IN_FILTERS export
// ═════════════════════════════════════════════════════════════════════════════

describe('BUILT_IN_FILTERS', () => {
  it('exports all expected filter names', () => {
    const expected = ['upper','lower','trim','capitalize','urlencode','urldecode','json','truncate','slug','reverse'];
    for (const name of expected) {
      expect(name in BUILT_IN_FILTERS).toBe(true);
    }
  });

  it('each built-in is a function', () => {
    for (const fn of Object.values(BUILT_IN_FILTERS)) {
      expect(typeof fn).toBe('function');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 17. Edge cases and stress scenarios
// ═════════════════════════════════════════════════════════════════════════════

describe('Edge cases', () => {
  it('handles a template that is 100% placeholders', () => {
    expect(render('{a}{b}{c}{d}', { a: 'W', b: 'o', c: 'r', d: 'd' })).toBe('Word');
  });

  it('handles very long template strings', () => {
    const text = 'x'.repeat(10_000);
    const template = `${text}{name}${text}`;
    expect(render(template, { name: 'Y' })).toBe(`${text}Y${text}`);
  });

  it('handles many unique placeholders in one template', () => {
    const data: Record<string, string> = {};
    const parts: string[] = [];
    for (let i = 0; i < 100; i++) {
      data[`k${i}`] = `v${i}`;
      parts.push(`{k${i}}`);
    }
    const result = render(parts.join(','), data);
    expect(result).toBe(Object.values(data).join(','));
  });

  it('handles unclosed delimiter gracefully (no crash)', () => {
    expect(() => render('Hello {name', { name: 'Alice' })).not.toThrow();
  });

  it('does not crash on object value (renders [object Object])', () => {
    expect(render('{obj}', { obj: { a: 1 } as unknown as string })).toBe('[object Object]');
  });
});
