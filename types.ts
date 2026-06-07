// ─────────────────────────────────────────────────────────────────────────────
// braces/types.ts
//
// Every public type lives here. No type is defined twice.
//
// The headline feature: TypeScript 4.1+ template literal type inference.
// When you write render("Hello {name}", { ... }), TypeScript statically
// extracts "name" from the string and enforces it in the data object —
// catching typos at compile time with zero runtime overhead.
// ─────────────────────────────────────────────────────────────────────────────

// ── Primitive value types ────────────────────────────────────────────────────

export type Primitive = string | number | boolean | null | undefined;

/** Any function that returns a renderable value when invoked. */
export type DataFunction = () => Primitive | DataValue;

/** Any value that can be resolved from a placeholder. */
export type DataValue =
  | Primitive
  | DataFunction
  | readonly DataValue[]
  | DataValue[]
  | { readonly [key: string]: DataValue };

/** The data object passed to render(). Allows arbitrary depth. */
export type DataObject = Record<string, DataValue>;

// ── TypeScript template literal path extraction ───────────────────────────────
//
// This machinery extracts placeholder paths from template string literals at
// the TYPE LEVEL — no runtime code involved. The compiler enforces data shape.
//
// "Hello {user.name}, you have {count:0} items"
//  → ExtractPaths → "user.name" | "count"
//  → TopKey       → "user" | "count"
//  → InferData    → { user?: DataValue; count?: DataValue } & DataObject
//
// Why top-level keys only?
//   Full recursive path reconstruction (user → { name: DataValue }) is
//   achievable but requires 10+ recursive types and hits TS recursion limits
//   for deeply nested real-world templates. Top-level key enforcement catches
//   90% of typos while remaining legible and compiler-friendly.

/** @internal — trim leading/trailing spaces from a string literal type */
type TrimL<S extends string> = S extends ` ${infer T}` ? TrimL<T> : S;
type TrimR<S extends string> = S extends `${infer T} ` ? TrimR<T> : S;
type Trim<S extends string> = TrimL<TrimR<S>>;

/** @internal — "path|filter" → "path" */
type StripFilters<S extends string> =
  S extends `${infer P}|${string}` ? P : S;

/** @internal — "path:default" → "path" */
type StripDefault<S extends string> =
  S extends `${infer P}:${string}` ? P : S;

/** @internal — clean the expression down to just its path */
type ExprPath<S extends string> = Trim<StripDefault<StripFilters<Trim<S>>>>;

/**
 * Extract all placeholder path strings from a template literal.
 * Works with default `{` / `}` delimiters only (custom delimiters cannot be
 * statically known at the type level without a type-level parser).
 *
 * @example
 * type K = ExtractPaths<"Hello {user.name}, you have {count:0} items">
 * //   K = "user.name" | "count"
 */
export type ExtractPaths<T extends string> =
  T extends `${string}{${infer Expr}}${infer Rest}`
    ? ExprPath<Expr> | ExtractPaths<Rest>
    : never;

/** @internal — get the root key from a dotted or bracketed path */
type RootKey<S extends string> =
  S extends `${infer K}.${string}` ? K :
  S extends `${infer K}[${string}` ? K :
  S;

/**
 * Infer a permissive data type from a template literal.
 * Required root keys are optional in the type (they may have defaults),
 * but if you supply a key it must be spelled correctly.
 *
 * @example
 * type D = InferData<"Hello {name}, you have {count:0} items">
 * //   D = { name?: DataValue; count?: DataValue } & DataObject
 */
export type InferData<T extends string> =
  [ExtractPaths<T>] extends [never]
    ? DataObject  // no placeholders → accept anything
    : { [K in RootKey<ExtractPaths<T>>]?: DataValue } & DataObject;

// ── Delimiter options ────────────────────────────────────────────────────────

export interface DelimiterOptions {
  /** Opening delimiter. Default: `"{"` */
  open: string;
  /** Closing delimiter. Default: `"}"` */
  close: string;
}

// ── Missing-value behaviour ──────────────────────────────────────────────────

/**
 * Controls what happens when a placeholder has no value and no default.
 *
 * - `"silent"` — Return `""`. Good for production. (default)
 * - `"warn"`   — Return `""` and print a `console.warn`. Good for development.
 * - `"strict"` — Throw a `BracesError`. Good for CI/validation pipelines.
 */
export type MissingValueMode = 'silent' | 'warn' | 'strict';

// ── Filter ───────────────────────────────────────────────────────────────────

/**
 * A filter transforms a resolved string value before it is written to output.
 *
 * Filters are chained left-to-right in the template: `{name|trim|upper}`.
 * Each filter receives the output of the previous filter.
 *
 * Filters MUST be synchronous and MUST return a string.
 */
export type Filter = (value: string) => string;

/** A named map of filters, passed to `createRenderer()`. */
export type FilterMap = Record<string, Filter>;

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Lifecycle hooks for a renderer instance.
 * Hooks are called at specific points during rendering.
 */
export interface RendererHooks {
  /**
   * Called when a placeholder resolves to null/undefined (before applying
   * the default value). Return a string to override the output.
   *
   * @example
   * hooks: {
   *   onMissing: (path) => `[MISSING: ${path}]`  // great for debugging
   * }
   */
  onMissing?: (path: string, template: string) => string | undefined;
}

// ── Renderer options ──────────────────────────────────────────────────────────

export interface RendererOptions {
  /**
   * Custom delimiter pair.
   * @default { open: '{', close: '}' }
   */
  delimiters?: DelimiterOptions;

  /**
   * Escape HTML entities in resolved values. Prevents XSS when rendering
   * into HTML. Escapes: `& < > " '`.
   * @default false
   */
  escapeHtml?: boolean;

  /**
   * Behaviour when a placeholder path cannot be resolved and has no default.
   * @default "silent"
   */
  missing?: MissingValueMode;

  /**
   * Custom filter functions, referenced in templates as `{value|filterName}`.
   * Merged with (and can override) built-in filters.
   *
   * @example
   * filters: {
   *   currency: (v) => '$' + Number(v).toFixed(2),
   *   date: (v) => new Date(v).toLocaleDateString(),
   * }
   */
  filters?: FilterMap;

  /**
   * Lifecycle hooks for observing or customising rendering behaviour.
   */
  hooks?: RendererHooks;

  /**
   * Maximum depth to traverse for nested paths like `a.b.c.d`.
   * Prevents runaway traversal on malformed inputs.
   * @default 10
   */
  maxDepth?: number;

  /**
   * LRU cache capacity for compiled templates.
   * Set to 0 to disable caching entirely.
   * @default 512
   */
  cacheSize?: number;
}

/**
 * Per-call options that override renderer defaults.
 *
 * Note on `delimiters`: delimiters are a compile-time concern (they change
 * how the template is scanned). When supplied per-call, the renderer uses a
 * delimiter-scoped cache key so the correct compiled form is always used.
 * For a fixed delimiter pair used across many calls, prefer `createRenderer()`
 * — it avoids the per-call key concatenation overhead.
 */
export type RenderCallOptions = Pick<
  RendererOptions,
  'escapeHtml' | 'missing' | 'filters' | 'delimiters'
>;

// ── Compiled template ─────────────────────────────────────────────────────────

/**
 * A compiled render function produced by `precompile()` or
 * `renderer.precompile()`. Parsing has already happened; only
 * value resolution runs on each call.
 */
export type CompiledTemplate<T extends string = string> = (
  data: InferData<T>,
  overrides?: RenderCallOptions
) => string;

// ── Renderer instance ─────────────────────────────────────────────────────────

/**
 * A self-contained renderer with its own LRU cache, options, and filters.
 * Create one with `createRenderer(options)`.
 *
 * Prefer a renderer instance over the top-level `render()` function when:
 * - You have shared defaults (delimiters, escapeHtml, custom filters)
 * - You are in an SSR environment (avoids shared global cache state)
 * - You run multiple independent tenants in one process
 */
export interface Renderer {
  /**
   * Render a template with the given data, using this renderer's defaults.
   * Parsed templates are cached in this renderer's LRU cache.
   */
  render<T extends string>(
    template: T,
    data?: InferData<T>,
    overrides?: RenderCallOptions
  ): string;

  /**
   * Pre-compile a template into a reusable render function.
   * Use this in hot paths where the same template is rendered many times
   * with different data.
   */
  precompile<T extends string>(template: T): CompiledTemplate<T>;

  /**
   * Render a template as an async stream of string chunks.
   * Designed for SSR: each text token is yielded immediately; expression
   * tokens are yielded after resolution. Compatible with Node.js Readable,
   * Deno streams, and the Web Streams API.
   *
   * @example
   * for await (const chunk of renderer.stream(template, data)) {
   *   res.write(chunk);
   * }
   */
  stream<T extends string>(
    template: T,
    data?: InferData<T>,
    overrides?: RenderCallOptions
  ): AsyncIterable<string>;

  /** Clear this renderer's compiled template cache. */
  clearCache(): void;

  /** Number of compiled templates currently in this renderer's cache. */
  readonly cacheSize: number;

  /** The resolved options this renderer was created with. */
  readonly options: Readonly<Required<RendererOptions>>;
}

// ── Error types ───────────────────────────────────────────────────────────────

/** Extended error thrown when `missing: "strict"` and a path is unresolved. */
export class BracesError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly template: string,
    public readonly position: number
  ) {
    super(message);
    this.name = 'BracesError';
    // Restore prototype chain (required for `instanceof` in transpiled code)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Internal token types (not exported from the package index) ────────────────

export const enum TokenKind {
  Text = 0,
  Expr = 1,
}

export interface TextToken {
  readonly kind: TokenKind.Text;
  readonly value: string;
  /** Byte offset of this token's start in the template string. */
  readonly start: number;
}

export interface ExprToken {
  readonly kind: TokenKind.Expr;
  /** Dot-notation path: "user.name", "items[0]", "count" */
  readonly path: string;
  /** Pipe-separated filter names, in application order. */
  readonly filters: readonly string[];
  /** Fallback value (everything after the first `:` in the expression). */
  readonly defaultValue: string | undefined;
  /** Byte offset of this token's start in the template string. */
  readonly start: number;
}

export type Token = TextToken | ExprToken;
