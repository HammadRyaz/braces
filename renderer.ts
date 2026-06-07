// ─────────────────────────────────────────────────────────────────────────────
// braces/renderer.ts — createRenderer() Factory
//
// WHY A FACTORY?
//   The top-level render() function is convenient but has a hard architectural
//   problem: it uses a GLOBAL cache. In practice this causes:
//
//   1. SSR Cross-request State Leaks
//      If two requests are handled in the same process (Node.js is single-
//      threaded but event-loop-concurrent), they share the cache. If one
//      request causes a cache eviction, another may re-parse unnecessarily.
//      A renderer instance has its OWN LRU cache — isolated per server,
//      per route, or even per request.
//
//   2. Multi-tenant Isolation
//      An app serving multiple clients (each with different default options,
//      delimiters, or filters) can't share a global cache safely. A renderer
//      per tenant solves this cleanly.
//
//   3. Testability
//      Global state is the enemy of unit tests. A renderer instance can be
//      created fresh per test with clearCache() or simply instantiated new.
//
//   4. Option Ergonomics
//      Without a renderer, you repeat { escapeHtml: true, delimiters: ... }
//      on every single render() call. A renderer bakes in the defaults.
//
// CUSTOM DELIMITERS PER-CALL:
//   Delimiters are a compile-time concern — they determine HOW the scanner
//   tokenises the template. When a per-call override supplies different
//   delimiters, we include them in the cache key so that the same template
//   string compiled with {{}} is stored separately from one compiled with {}.
//   This keeps the cache correct at the cost of a slightly longer key string.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Renderer,
  RendererOptions,
  RenderCallOptions,
  DataObject,
  CompiledTemplate,
  InferData,
} from './types.js';
import { LRUCache }     from './cache.js';
import { scan }         from './scanner.js';
import { compile }      from './compiler.js';
import { mergeFilters } from './filters.js';

// ── Default options ───────────────────────────────────────────────────────────

const DEFAULT_OPEN  = '{';
const DEFAULT_CLOSE = '}';
const DEFAULT_CACHE = 512;
const DEFAULT_DEPTH = 10;

function resolveOptions(
  opts: RendererOptions = {}
): Required<RendererOptions> {
  return {
    delimiters: opts.delimiters ?? { open: DEFAULT_OPEN, close: DEFAULT_CLOSE },
    escapeHtml: opts.escapeHtml ?? false,
    missing:    opts.missing    ?? 'silent',
    filters:    mergeFilters(opts.filters),
    hooks:      opts.hooks      ?? {},
    maxDepth:   opts.maxDepth   ?? DEFAULT_DEPTH,
    cacheSize:  opts.cacheSize  ?? DEFAULT_CACHE,
  };
}

// ── createRenderer ────────────────────────────────────────────────────────────

/**
 * Create a self-contained renderer with its own LRU cache and default options.
 *
 * @example
 * const renderer = createRenderer({
 *   escapeHtml: true,
 *   missing: 'warn',
 *   filters: {
 *     currency: (v) => '$' + Number(v).toFixed(2),
 *   },
 * });
 *
 * renderer.render("Price: {amount|currency}", { amount: 9.99 });
 * // → "Price: $9.99"
 */
export function createRenderer(opts: RendererOptions = {}): Renderer {
  const resolved = resolveOptions(opts);
  const { delimiters, cacheSize } = resolved;

  // Each renderer has its own isolated LRU cache.
  const cache = cacheSize > 0
    ? new LRUCache<string, CompiledTemplate>(cacheSize)
    : null;

  // ── Internal helpers ───────────────────────────────────────────────────────

  /**
   * Return a compiled template, using the LRU cache when available.
   *
   * Cache key strategy:
   *   - Default delimiters  →  template string alone  (common, fast path)
   *   - Custom delimiters   →  "<open>\x00<close>\x00<template>"
   *
   * Using NUL (\x00) as separator is safe because NUL cannot appear in valid
   * delimiter strings entered by developers. This avoids any ambiguity between
   * a delimiter that ends with a prefix of a template string.
   */
  function getCompiled(
    template: string,
    open: string,
    close: string,
  ): CompiledTemplate {
    const useDefaultDelimiters =
      open === delimiters.open && close === delimiters.close;

    const key = useDefaultDelimiters
      ? template
      : `${open}\x00${close}\x00${template}`;

    if (cache !== null) {
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
    }

    const tokens = scan(template, { open, close });

    // When per-call delimiters differ from the renderer's baked-in defaults,
    // compile with a patched options object so the closure references the
    // correct pair (e.g., relevant for the streaming renderer).
    const compileOpts = useDefaultDelimiters
      ? resolved
      : { ...resolved, delimiters: { open, close } };

    const fn = compile(tokens, compileOpts);

    if (cache !== null) cache.set(key, fn);
    return fn;
  }

  // ── Renderer object ────────────────────────────────────────────────────────

  const renderer: Renderer = {
    render<T extends string>(
      template: T,
      data: InferData<T> = {} as InferData<T>,
      overrides?: RenderCallOptions
    ): string {
      const open  = overrides?.delimiters?.open  ?? delimiters.open;
      const close = overrides?.delimiters?.close ?? delimiters.close;

      // Fast path: no open delimiter → template is plain text
      if (!template.includes(open)) return template;

      return getCompiled(template, open, close)(data as DataObject, overrides);
    },

    precompile<T extends string>(template: T): CompiledTemplate<T> {
      return getCompiled(
        template, delimiters.open, delimiters.close
      ) as CompiledTemplate<T>;
    },

    async *stream<T extends string>(
      template: T,
      data: InferData<T> = {} as InferData<T>,
      overrides?: RenderCallOptions
    ): AsyncIterable<string> {
      // ── Streaming renderer ───────────────────────────────────────────────
      //
      // WHY THIS MATTERS FOR SSR:
      //   Traditional template engines render everything to a string, then
      //   flush. This means the browser cannot start rendering the <head>
      //   until the entire page (including async data fetches for the footer)
      //   is done.
      //
      //   A streaming renderer yields each text segment immediately. The
      //   HTTP/1.1 Transfer-Encoding: chunked or HTTP/2 streaming response
      //   begins flowing to the browser instantly, improving TTFB and LCP.
      //
      //   Each TextToken is yielded immediately; ExprTokens are resolved
      //   synchronously and yielded. Future versions may accept a lazy data
      //   factory (Promise<DataObject>) to resolve tokens asynchronously.

      const open  = overrides?.delimiters?.open  ?? delimiters.open;
      const close = overrides?.delimiters?.close ?? delimiters.close;

      if (!template.includes(open)) {
        yield template;
        return;
      }

      const escape  = overrides?.escapeHtml ?? resolved.escapeHtml;
      const missing = overrides?.missing    ?? resolved.missing;
      const filters = overrides?.filters
        ? { ...resolved.filters, ...overrides.filters }
        : resolved.filters;

      const { scan: _scan }                  = await import('./scanner.js');
      const { resolvePath, parsePath }       = await import('./resolver.js');
      const { applyFilters }                 = await import('./filters.js');
      const { escapeHtml: esc }              = await import('./escaper.js');
      const { BracesError, TokenKind }       = await import('./types.js');

      const tokens = _scan(template, { open, close });

      for (const token of tokens) {
        if (token.kind === TokenKind.Text) {
          yield token.value;
          // Yield control back to the event loop between chunks.
          // This prevents starving other concurrent requests in Node.js.
          await Promise.resolve();
          continue;
        }

        const segments = parsePath(token.path);
        const { value, found } = resolvePath(
          token.path, segments, token.defaultValue,
          data as DataObject, resolved.maxDepth
        );

        if (!found && token.defaultValue === undefined) {
          if (missing === 'strict') {
            throw new BracesError(
              `[braces] Unresolved placeholder "${token.path}"`,
              token.path, template, token.start
            );
          }
          if (missing === 'warn' && typeof console !== 'undefined') {
            console.warn(`[braces] Missing value for "${token.path}"`);
          }
        }

        let out = token.filters.length > 0
          ? applyFilters(value, token.filters, filters)
          : value;

        if (escape) out = esc(out);
        yield out;
      }
    },

    clearCache(): void {
      cache?.clear();
    },

    get cacheSize(): number {
      return cache?.size ?? 0;
    },

    get options(): Readonly<Required<RendererOptions>> {
      return resolved;
    },
  };

  return renderer;
}

// ── Default singleton renderer ────────────────────────────────────────────────
//
// The top-level render() and precompile() functions delegate to this singleton.
// It uses default options and a shared global LRU cache.
// Applications that need isolation should call createRenderer() directly.

export const defaultRenderer: Renderer = createRenderer();
