// ─────────────────────────────────────────────────────────────────────────────
// braces/filters.ts — Built-in Filter Registry
//
// Filters transform resolved values before they are written to output.
// Syntax: {path|filter1|filter2}  (applied left to right)
//
// Design rules:
// 1. Every filter is a pure function: (string) => string
// 2. Filters MUST be synchronous (async breaks streaming guarantees)
// 3. Filters MUST return a string (enforced by the Filter type)
// 4. Built-in filters are intentionally minimal — common, unambiguous, safe
// 5. Naming follows CSS/Liquid conventions for familiarity
//
// Why built-ins?
//   Common transformations (upper, lower, trim) appear in virtually every
//   real-world template. Having them built-in means no boilerplate when
//   creating a renderer. Custom filters via createRenderer({ filters: {} })
//   can add domain-specific transforms or override built-ins.
// ─────────────────────────────────────────────────────────────────────────────

import type { Filter, FilterMap } from './types.js';

// ── Built-in filters ──────────────────────────────────────────────────────────

/** Convert to UPPERCASE. */
const upper: Filter = (v) => v.toUpperCase();

/** Convert to lowercase. */
const lower: Filter = (v) => v.toLowerCase();

/** Remove leading and trailing whitespace. */
const trim: Filter = (v) => v.trim();

/**
 * Capitalise the first letter of each word.
 * "hello world" → "Hello World"
 */
const capitalize: Filter = (v) =>
  v.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Encode as a URI component (space → %20, & → %26, etc.).
 * Essential for building URLs from user input.
 */
const urlencode: Filter = (v) => encodeURIComponent(v);

/**
 * Decode a URI component. Inverse of urlencode.
 * Silently returns the original string on decode failure.
 */
const urldecode: Filter = (v) => {
  try { return decodeURIComponent(v); } catch { return v; }
};

/**
 * Serialise to a JSON string.
 * Useful for embedding values inside a <script> tag or data attribute.
 */
const json: Filter = (v) => JSON.stringify(v);

/**
 * Truncate to 50 characters, appending "…" if the value is longer.
 * Override the length by providing a custom filter in createRenderer().
 */
const truncate: Filter = (v) => v.length > 50 ? v.slice(0, 50) + '\u2026' : v;

/**
 * Replace every whitespace run with a single hyphen.
 * "Hello World" → "hello-world"
 * Useful for generating slugs, CSS class names, or IDs.
 */
const slug: Filter = (v) =>
  v
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-');

/**
 * Reverse the string character-by-character.
 * Handles multi-byte characters correctly via Array.from.
 */
const reverse: Filter = (v) => Array.from(v).reverse().join('');

// ── Filter registry ───────────────────────────────────────────────────────────

/**
 * The built-in filter map. Frozen so callers cannot accidentally mutate it.
 * Merged with user filters in createRenderer() — user filters take precedence.
 */
export const BUILT_IN_FILTERS: Readonly<FilterMap> = Object.freeze({
  upper,
  lower,
  trim,
  capitalize,
  urlencode,
  urldecode,
  json,
  truncate,
  slug,
  reverse,
} satisfies FilterMap);

/**
 * Merge built-in filters with user-provided filters.
 * User filters WIN on name collision — this allows overriding built-ins.
 */
export function mergeFilters(userFilters?: FilterMap): FilterMap {
  if (!userFilters || Object.keys(userFilters).length === 0) {
    return BUILT_IN_FILTERS;
  }
  return Object.freeze({ ...BUILT_IN_FILTERS, ...userFilters });
}

/**
 * Apply a chain of named filters to a string value.
 * Unknown filter names are silently skipped (logged in warn mode by caller).
 *
 * @param value   - The resolved string to transform
 * @param names   - Ordered list of filter names to apply
 * @param filters - The merged filter registry
 * @returns       - The transformed string
 */
export function applyFilters(
  value: string,
  names: readonly string[],
  filters: FilterMap
): string {
  let result = value;
  for (const name of names) {
    const fn = filters[name];
    if (fn !== undefined) {
      result = fn(result);
    }
    // Unknown filters: silently skip.
    // In a future version this could emit a one-time warning.
  }
  return result;
}
