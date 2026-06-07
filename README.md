# braces

**A tiny, fast, dependency-free template engine for universal `{curly-brace}` interpolation.**
It's a production-grade, ultra-lightweight (< 1KB min+gzipped), zero-dependency curly-brace template engine designed for high-performance applications, serverless environments, and edge networks.

```
npm install @ryaz/braces
```

[![npm version](https://img.shields.io/npm/v/@ryaz%2Fbraces.svg)](https://www.npmjs.com/package/@ryaz/braces)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@ryaz%2Fbraces?label=min%2Bgzip)](https://bundlephobia.com/package/@ryaz/braces)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)](https://www.typescriptlang.org/)

---

## Why braces?

JavaScript template literals are great — until your strings come from a database, API response, CMS, or config file. At that point, interpolation stops working and you write `str.replace()` loops forever.

**braces** is the missing primitive: a first-class, safe, fast interpolation engine for any string, from anywhere.

```ts
import { render } from "@ryaz/braces";

// ✅ Works on any string — not just code you write
const template = fetchFromDatabase(); // "Welcome back, {user.name}!"
render(template, { user: { name: "Alice" } });
// → "Welcome back, Alice!"
```

---

## Feature matrix

|                         |   braces   | Mustache | Handlebars | lodash.template | EJS  |
| ----------------------- | :--------: | :------: | :--------: | :-------------: | :--: |
| **Bundle (min+gz)**     | **~1.1kB** |   ~9kB   |   ~22kB    |      ~17kB      | ~8kB |
| **Zero dependencies**   |     ✅     |    ✅    |     ❌     |       ✅        |  ❌  |
| **TypeScript-native**   |     ✅     |    ❌    |     ❌     |       ❌        |  ❌  |
| **Inferred data types** |     ✅     |    ❌    |     ❌     |       ❌        |  ❌  |
| **Nested paths**        |     ✅     |    ✅    |     ✅     |       ❌        |  —   |
| **Array access**        |     ✅     |    ✅    |     ✅     |       ❌        |  —   |
| **Default values**      |     ✅     |    ❌    |     ❌     |       ❌        |  ❌  |
| **Filter pipes**        |     ✅     |    ❌    |     ✅     |       ❌        |  ❌  |
| **Custom delimiters**   |     ✅     |    ✅    |     ❌     |       ✅        |  ✅  |
| **Escape sequences**    |     ✅     |    ❌    |     ❌     |       ❌        |  ❌  |
| **HTML escaping**       |     ✅     |    ✅    |     ✅     |       ❌        |  ✅  |
| **Streaming SSR**       |     ✅     |    ❌    |     ❌     |       ❌        |  ❌  |
| **Isolated renderer**   |     ✅     |    ❌    |     ❌     |       ❌        |  ❌  |
| **LRU cache**           |  ✅ O(1)   |    ❌    |     ✅     |       ❌        |  ❌  |
| **Prototype safety**    |     ✅     |    ✅    |     ✅     |       ❌        |  ❌  |
| **Tree-shakeable**      |     ✅     |    ❌    |     ❌     |       ❌        |  ❌  |

---

## Quick start

```ts
import { render } from "@ryaz/braces";

render("Hello {name}!", { name: "World" });
// → "Hello World!"
```

---

## Core API

### `render(template, data?, options?)`

Render a template string with provided data. Templates are compiled and cached in an O(1) LRU cache automatically — repeated calls with the same template string hit zero parsing overhead.

```ts
render(template: string, data?: DataObject, options?: RenderCallOptions): string
```

**TypeScript inference** — when `template` is a string literal, TypeScript statically
extracts placeholder names and enforces them in `data`:

```ts
render("Hello {name}", { name: "Alice" }); // ✅ — correct
render("Hello {name}", { nmae: "Alice" }); // ❌ — typo caught at compile time
render("Hello {name}", { name: "Alice", extra: 1 }); // ✅ — extra keys allowed
```

---

### `precompile(template)`

Pre-compile a template into a reusable function. **Use this on hot paths.** Parsing happens once; every subsequent call only resolves values.

```ts
const greet = precompile("Hello {firstName} {lastName}!");

greet({ firstName: "Alice", lastName: "Smith" }); // "Hello Alice Smith!"
greet({ firstName: "Bob", lastName: "Jones" }); // "Hello Bob Jones!"
```

---

### `createRenderer(options?)`

Create an isolated renderer with its own LRU cache, baked-in defaults, and filter registry. This is the **recommended API** for production applications.

```ts
import { createRenderer } from "@ryaz/braces";

const renderer = createRenderer({
  escapeHtml: true,
  missing: "warn",
  filters: {
    currency: (v) => "$" + Number(v).toFixed(2),
    date: (v) => new Date(v).toLocaleDateString(),
  },
});

renderer.render("Price: {price|currency}", { price: "19.99" });
// → "Price: $19.99"
```

---

### `renderToStream(template, data?, options?)`

Render as an `AsyncIterable<string>`. Each text segment is yielded immediately, without waiting for the full template to resolve. Designed for SSR to improve Time To First Byte.

```ts
import { renderToStream } from "@ryaz/braces";

for await (const chunk of renderToStream(
  "<h1>{title}</h1><p>{body}</p>",
  data,
)) {
  res.write(chunk);
}
```

---

## Full Feature Reference

### Basic interpolation

```ts
render("Hello {name}", { name: "John" });
// → "Hello John"

render("My name is {name} and I am {age} years old", { name: "John", age: 20 });
// → "My name is John and I am 20 years old"
```

### Nested objects (dot notation)

```ts
render("Hello {user.profile.displayName}", {
  user: { profile: { displayName: "Alice" } },
});
// → "Hello Alice"
```

### Array access (bracket notation)

```ts
render("First: {items[0]}", { items: ["Alpha", "Beta"] });
// → "First: Alpha"

render("Winner: {leaderboard[0].name}", {
  leaderboard: [{ name: "Alice", score: 9800 }],
});
// → "Winner: Alice"
```

### Default values

Use `:` inside a placeholder to define a fallback value. Colons in the fallback itself are preserved — URL defaults work correctly:

```ts
render("Hello {name:Guest}", {}); // → "Hello Guest"
render("Visit {url:https://example.com}", {}); // → "Visit https://example.com"
render("Hello {name:Guest}", { name: "Alice" }); // → "Hello Alice"
render("{n:99}", { n: 0 }); // → "0" (0 ≠ missing)
```

### Filter pipes

Apply transformations to resolved values with `|`:

```ts
render("{name|upper}", { name: "alice" }); // → "ALICE"
render("{name|trim|capitalize}", { name: "  alice  " }); // → "Alice"
render("{title|slug}", { title: "Hello World!" }); // → "hello-world"
render("{q|urlencode}", { q: "hello world & more" }); // → "hello%20world%20%26%20more"
```

**Built-in filters:** `upper`, `lower`, `trim`, `capitalize`, `slug`, `urlencode`, `urldecode`, `json`, `truncate`, `reverse`

**Filters + defaults** — filter applies to the resolved value, default applies when the path is missing:

```ts
render("{name|upper:GUEST}", {}); // → "GUEST"
render("{name|upper:GUEST}", { name: "alice" }); // → "ALICE"
```

### Custom filters

```ts
const renderer = createRenderer({
  filters: {
    currency: (v) => "$" + Number(v).toFixed(2),
    bold: (v) => `<strong>${v}</strong>`,
    ellipsis: (v) => (v.length > 20 ? v.slice(0, 20) + "…" : v),
  },
});

renderer.render("{price|currency}", { price: "9.99" }); // → "$9.99"
renderer.render("{bio|ellipsis}", { bio: "A very long bio..." }); // → "A very long bi…"
```

### Function values

When a data value is a function, it is called automatically:

```ts
render("{token}", { token: () => crypto.randomUUID() });
// → "110e8400-e29b-41d4-a716-446655440000"

render("{timestamp}", { timestamp: () => new Date().toISOString() });
// → "2024-01-15T12:30:00.000Z"
```

### Custom delimiters

```ts
// Per-call
render(
  "Hello {{name}}",
  { name: "Alice" },
  { delimiters: { open: "{{", close: "}}" } },
);

// Baked into a renderer (preferred for repeated use)
const mustache = createRenderer({ delimiters: { open: "{{", close: "}}" } });
mustache.render("Hello {{name}}", { name: "Alice" }); // → "Hello Alice"
```

### Escaped delimiters

Prefix the open delimiter with `\` to emit it literally:

```ts
render("Price: \\{amount}", { amount: "99" });
// → "Price: {amount}"

render("\\{raw} and {actual}", { actual: "value" });
// → "{raw} and value"
```

### HTML escaping (XSS prevention)

```ts
render(
  "{html}",
  { html: '<script>alert("xss")</script>' },
  { escapeHtml: true },
);
// → "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"

// Or baked in
const safe = createRenderer({ escapeHtml: true });
safe.render("{content}", { content: userInput }); // always escaped
```

### Missing value modes

```ts
// "silent" (default) — return empty string
render("{missing}", {}, { missing: "silent" }); // → ""

// "warn" — return empty string and log a console.warn
render("{missing}", {}, { missing: "warn" }); // → "" + console.warn(...)

// "strict" — throw BracesError
render("{missing}", {}, { missing: "strict" }); // → throws BracesError
```

---

## RenderOptions reference

| Option       | Type                             | Default        | Description                       |
| ------------ | -------------------------------- | -------------- | --------------------------------- |
| `delimiters` | `{ open, close }`                | `{ '{', '}' }` | Open/close delimiter pair         |
| `escapeHtml` | `boolean`                        | `false`        | Escape `& < > " ' \``             |
| `missing`    | `'silent' \| 'warn' \| 'strict'` | `'silent'`     | Unresolved placeholder behaviour  |
| `filters`    | `Record<string, Filter>`         | `{}`           | Custom filter functions           |
| `maxDepth`   | `number`                         | `10`           | Maximum path traversal depth      |
| `cacheSize`  | `number`                         | `512`          | LRU cache capacity (0 = disabled) |

---

## Performance

### Architecture

```
render()
  │
  ├─ Fast path: !template.includes(open) → return as-is   O(n) string scan
  │
  ├─ Cache hit  → compiled fn(data)                        O(1) LRU lookup
  │
  └─ Cache miss → scan() → compile() → cache → fn(data)   O(template length)
                                                            compiled once, reused forever
```

### Why a hand-written scanner instead of regex?

- **No mutable state** — regex `lastIndex` is mutable and causes subtle bugs when a cached regex is used across concurrent renders. The scanner is a pure function with no shared state.
- **Precise error positions** — the scanner tracks byte offsets, enabling accurate `BracesError` messages.
- **SIMD-backed indexOf** — finding the close delimiter uses `String.prototype.indexOf`, which V8 compiles to SIMD instructions. This is faster than a custom character loop for most delimiter lengths.
- **Extensible** — adding a new token type (comment, conditional) requires a single `if` branch, not a regex rewrite.

### Why O(1) LRU over a plain Map?

A plain `Map` with "evict oldest key" is `O(n)` for eviction — `Map.keys().next()` walks the entire hash chain. A doubly-linked list + Map gives `O(1)` get, set, and eviction.

### Benchmark estimates

| Scenario                             | ops/sec (est.) |
| ------------------------------------ | -------------- |
| `render()` — cached, simple template | ~2,800,000     |
| `render()` — cached, 5 nested paths  | ~1,100,000     |
| `precompile()` call, simple template | ~4,500,000     |
| Fast path (no delimiter in template) | ~12,000,000    |
| First parse (uncached, 10 tokens)    | ~220,000       |

Run `npm run bench` for results on your hardware.

---

## Security

### XSS prevention

Enable `escapeHtml: true` whenever rendering user-supplied values into HTML. Escapes `& < > " ' \`` (OWASP minimum + backtick for IE-style attribute injection).

```ts
const safe = createRenderer({ escapeHtml: true });
safe.render("{userInput}", { userInput: '"><script>alert(1)</script>' });
// → "&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"
```

### Prototype pollution

Every segment of every path is checked against a blocklist (`__proto__`, `constructor`, `prototype`) at traversal time — not just the root. This closes the `{safe.__proto__.evil}` attack vector.

```ts
render("{__proto__.polluted}", {}); // → ""
render("{safe.__proto__.polluted}", {}); // → ""  ← checked at EVERY step
render("{constructor.prototype.evil}", {}); // → ""
```

### Path depth limit

The `maxDepth` option (default: 10) prevents runaway traversal on adversarially long paths:

```ts
// 11 segments — silently returns "" with default maxDepth: 10
render("{a.b.c.d.e.f.g.h.i.j.k}", {});
```

### No `eval`, no `Function()`

Template execution is a plain `for` loop over a flat token array. No dynamic code generation, no eval, no attack surface. Function values in the data object are called with zero arguments and in no special scope — they cannot access any closed-over state.

---

## SSR with streaming

```ts
import { createRenderer } from "@ryaz/braces";
import { Readable } from "node:stream";

const renderer = createRenderer({ escapeHtml: true });

// Express.js example
app.get("/page", async (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");

  const template = await fs.readFile("templates/page.html", "utf8");
  const data = await db.getPageData(req.params.id);

  // Browser receives the <head> before the <body> data is even queried
  for await (const chunk of renderer.stream(template, data)) {
    res.write(chunk);
  }
  res.end();
});
```

---

## TypeScript — advanced usage

### Path inference from string literals

When `template` is a `const` or inline literal, TypeScript extracts the placeholder root keys and enforces them in the data object:

```ts
// TypeScript sees { name?: DataValue } & DataObject
render("Hello {name}", { name: "Alice" }); // ✅
render("Hello {name}", { nmae: "Alice" }); // ❌ 'nmae' not in inferred type
```

### Using `ExtractPaths` and `InferData`

```ts
import type { ExtractPaths, InferData } from "@ryaz/braces";

type Paths = ExtractPaths<"Hello {user.name}, you have {count:0} items">;
// → "user.name" | "count"

type Data = InferData<"Hello {user.name}, you have {count:0} items">;
// → { user?: DataValue; count?: DataValue } & DataObject
```

### Typed compiled templates

```ts
import type { CompiledTemplate } from "@ryaz/braces";

const greet: CompiledTemplate<"Hello {name}!"> = precompile("Hello {name}!");
greet({ name: "Alice" }); // ✅
```

---

## Publishing

```bash
npm run build          # compile ESM + CJS + type declarations
npm test               # run 118 tests
npm run typecheck      # full strict TypeScript check
npm version patch      # bump version
npm publish            # runs prepublishOnly automatically
```

The package ships:

- `dist/esm/` — native ES modules (`.js`) + source maps + declarations (`.d.ts`)
- `dist/cjs/` — CommonJS modules (`.cjs`) + declarations (`.d.cts`)
- Zero runtime dependencies

---

## Contributing

```bash
git clone https://github.com/hammadryaz/braces
cd braces && npm install
npm run test:watch    # TDD mode
npm run typecheck     # type safety
npm run bench         # performance
```

PRs are welcome. Please:

- Write tests for every new behaviour
- Keep bundle size impact minimal — check with `npm run size`
- Update this README for any API additions

---

## Roadmap

- [ ] Async filter support (`{value|asyncFilter}`)
- [ ] Conditional blocks `{#if condition}...{/if}` (opt-in, tree-shakeable)
- [ ] Tagged template literal API `` braces`Hello ${name}` ``
- [ ] CDN UMD build for `<script>` tag usage
- [ ] Plugin system for custom token types
- [ ] Deno and Bun first-class testing
- [ ] Streaming with lazy async data resolution

---

## License

MIT © 2026 hammadryaz
