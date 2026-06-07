// ─────────────────────────────────────────────────────────────────────────────
// braces — Public API  (v2)
//
// What is exported here is stable and public.
// What is NOT exported (scanner, compiler, LRUCache internals) can be
// refactored freely without breaking semver.
//
// Backward compatibility with v1:
//   render(), precompile(), clearCache(), getCacheSize() — unchanged API.
//   New in v2: createRenderer(), renderToStream(), BracesError, filter types.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  InferData,
  RenderCallOptions,
  CompiledTemplate,
} from './types.js';
import { defaultRenderer, createRenderer } from './renderer.js';

// ── Top-level render() — delegates to the default renderer ───────────────────

/**
 * Render a template string with the provided data.
 *
 * Templates are compiled and cached automatically on first use.
 * For repeated rendering of the same template, prefer `precompile()`.
 * For custom defaults (delimiters, escapeHtml, filters), use `createRenderer()`.
 *
 * TypeScript tip: when `template` is a string literal, TypeScript will
 * extract the placeholder names and enforce them in `data`:
 * ```ts
 * render("Hello {name}", { name: "Alice" });         // ✅
 * render("Hello {name}", { nmae: "Alice" });         // ❌ typo caught
 * render("Hello {user.greeting}", { user: {...} });  // ✅ root key enforced
 * ```
 *
 * @param template - Template string with `{placeholder}` expressions
 * @param data     - Values to interpolate (default: `{}`)
 * @param options  - Per-call options (override renderer defaults)
 * @returns        - Fully rendered string
 *
 * @example
 * render("Hello {name}!", { name: "World" })
 * // → "Hello World!"
 *
 * render("Hi {user.name}, you have {count:0} messages", {
 *   user: { name: "Alice" },
 *   count: 5,
 * })
 * // → "Hi Alice, you have 5 messages"
 *
 * render("{html}", { html: "<b>bold</b>" }, { escapeHtml: true })
 * // → "&lt;b&gt;bold&lt;/b&gt;"
 */
export function render<T extends string>(
  template: T,
  data?: InferData<T>,
  options?: RenderCallOptions
): string {
  return defaultRenderer.render(template, data, options);
}

// ── precompile() ──────────────────────────────────────────────────────────────

/**
 * Pre-compile a template into a reusable render function.
 *
 * Use this on hot render paths — the template is parsed exactly once.
 * The returned function has the same TypeScript inference as `render()`.
 *
 * @example
 * const greet = precompile("Hello {firstName} {lastName}!")
 *
 * greet({ firstName: "Alice", lastName: "Smith" }) // "Hello Alice Smith!"
 * greet({ firstName: "Bob",   lastName: "Jones" }) // "Hello Bob Jones!"
 */
export function precompile<T extends string>(template: T): CompiledTemplate<T> {
  return defaultRenderer.precompile(template);
}

/**
 * Render a template as an async stream of string chunks.
 * Designed for SSR — text tokens stream immediately without waiting for all
 * data to be resolved.
 *
 * @example
 * for await (const chunk of renderToStream("<h1>{title}</h1>", data)) {
 *   res.write(chunk);
 * }
 */
export function renderToStream<T extends string>(
  template: T,
  data?: InferData<T>,
  options?: RenderCallOptions
): AsyncIterable<string> {
  return defaultRenderer.stream(template, data, options);
}

// ── Cache management ──────────────────────────────────────────────────────────

/**
 * Clear the default renderer's compiled template cache.
 * Useful in test environments or after a hot-reload.
 */
export function clearCache(): void {
  defaultRenderer.clearCache();
}

/**
 * Number of compiled templates currently in the default renderer's cache.
 */
export function getCacheSize(): number {
  return defaultRenderer.cacheSize;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export { createRenderer } from './renderer.js';

// ── Escape utilities (re-exported for convenience) ────────────────────────────

export { escapeHtml, escapeAttr, escapeUrl } from './escaper.js';

// ── Built-in filters (re-exported for extension) ─────────────────────────────

export { BUILT_IN_FILTERS } from './filters.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type {
  // Value types
  Primitive,
  DataValue,
  DataFunction,
  DataObject,

  // Inference utilities (useful for consumers building abstractions)
  ExtractPaths,
  InferData,

  // Options
  DelimiterOptions,
  MissingValueMode,
  RendererOptions,
  RenderCallOptions,
  FilterMap,
  Filter,
  RendererHooks,

  // Compiled template
  CompiledTemplate,

  // Renderer interface
  Renderer,
} from './types.js';

// ── Error class ───────────────────────────────────────────────────────────────

export { BracesError } from './types.js';
