// ─────────────────────────────────────────────────────────────────────────────
// braces/resolver.ts — Path Resolver
//
// Responsibility: given a path like "user.address.city" or "items[0].label"
// and a data object, return the resolved string value.
//
// Security:
//   Prototype pollution is a class of attack where malicious user input
//   modifies Object.prototype via paths like "__proto__.polluted = true".
//   We defend at every traversal step — not just at the root — because
//   an attacker could craft a path like "safe.__proto__.evil".
//
//   Additionally we limit traversal depth to prevent algorithmic complexity
//   attacks on deeply constructed path strings.
//
// Performance:
//   parsePath() is called per-token-per-render by default. For the hot path
//   (precompile), segments are parsed ONCE during compilation and stored in
//   the ExprToken — so runtime resolution is just array traversal.
//   The `segmentCache` avoids repeat parsing for the same path string in the
//   non-precompiled (render()) path.
// ─────────────────────────────────────────────────────────────────────────────

// ── Prototype pollution guard ─────────────────────────────────────────────────

/**
 * Keys that MUST NOT be traversed regardless of data content.
 * Frozen to prevent runtime modification of the guard list itself.
 */
const BLOCKED: ReadonlySet<string> = Object.freeze(
  new Set(['__proto__', 'constructor', 'prototype'])
) as ReadonlySet<string>;

// ── Path segment types ────────────────────────────────────────────────────────

export type Segment = string | number;

// Segment parse cache — avoids reparsing the same path string repeatedly.
// Bounded at 1024 entries (distinct paths in real apps are typically << 100).
const segmentCache = new Map<string, readonly Segment[]>();
const SEGMENT_CACHE_MAX = 1024;

/**
 * Parse a path string into an ordered array of property segments.
 *
 * Handles:
 * - Dot notation:     "user.name"         → ["user", "name"]
 * - Bracket notation: "items[0]"          → ["items", 0]
 * - Mixed:            "users[1].address"  → ["users", 1, "address"]
 * - Consecutive:      "matrix[0][1]"      → ["matrix", 0, 1]
 *
 * Does NOT handle:
 * - Computed keys:  "obj[varName]"  (would require eval — intentionally unsafe)
 * - Quoted keys:    "obj['key']"    (not needed for JSON-compatible paths)
 * - Negative index: "arr[-1]"       (treated as string, resolves to undefined)
 */
export function parsePath(path: string): readonly Segment[] {
  const cached = segmentCache.get(path);
  if (cached !== undefined) return cached;

  // Replace [n] with .n, then split on '.'
  // Using a replace + split is faster than a custom char scanner for
  // short paths (< 128 chars), which covers 99% of real-world usage.
  const segments: Segment[] = [];
  // Only convert bracket notation that looks like a valid array index:
  // no leading zeros, so [0] and [42] are converted but [01] is NOT.
  // [01] stays as-is and becomes the string segment "obj[01]", which
  // will not resolve on a plain data object → returns undefined → "".
  const normalized = path.replace(/\[([1-9]\d*|0)\]/g, '.$1');

  for (const part of normalized.split('.')) {
    if (!part) continue;
    // Only treat as numeric index if it looks EXACTLY like a non-negative integer.
    // "01" is NOT 1 — leading zeros indicate a string key.
    const n = Number(part);
    segments.push(
      Number.isInteger(n) && n >= 0 && String(n) === part ? n : part
    );
  }

  const result = Object.freeze(segments);

  // Evict oldest entry if cache is full (simple FIFO — good enough here)
  if (segmentCache.size >= SEGMENT_CACHE_MAX) {
    segmentCache.delete(segmentCache.keys().next().value!);
  }
  segmentCache.set(path, result);

  return result;
}

// ── Path traversal ────────────────────────────────────────────────────────────

/**
 * Walk a nested data structure along the given segments.
 *
 * Returns `undefined` if:
 * - Any segment in the path is absent from the data
 * - A blocked key (__proto__ etc.) is encountered
 * - The traversal depth exceeds `maxDepth`
 * - A non-object is encountered before all segments are consumed
 *
 * Does NOT throw. All error cases silently return `undefined`.
 */
export function walk(
  data: unknown,
  segments: readonly Segment[],
  maxDepth: number
): unknown {
  let current: unknown = data;
  const len = segments.length;

  if (len > maxDepth) return undefined;

  for (let i = 0; i < len; i++) {
    if (current === null || current === undefined) return undefined;

    const seg = segments[i]!;

    // Block prototype pollution on string segments
    if (typeof seg === 'string' && BLOCKED.has(seg)) return undefined;

    // Only objects/arrays can be traversed
    const t = typeof current;
    if (t !== 'object' && t !== 'function') return undefined;

    // Safe property access — avoids Object.prototype.hasOwnProperty call
    // per segment (expensive). Direct [] access is safe because:
    // 1. BLOCKED protects __proto__/constructor/prototype
    // 2. We've already verified `current` is object/function
    current = (current as Record<string | number, unknown>)[seg];
  }

  return current;
}

// ── Value coercion ────────────────────────────────────────────────────────────

/**
 * Convert any resolved value to its canonical string representation.
 *
 * Contract:
 * - `null` | `undefined` | `NaN` → `""` (empty, caller decides the fallback)
 * - `false` | `0` → `"false"` | `"0"` (falsy ≠ missing)
 * - Functions → auto-invoked, result coerced
 * - Arrays → comma-joined (matches native Array.toString behaviour)
 * - Objects → "[object Object]" (intentional — users should resolve deeper)
 */
export function coerce(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'function') return coerce((value as () => unknown)());
  if (typeof value === 'number' && isNaN(value)) return null;
  return String(value);
}

// ── Public resolution entry point ─────────────────────────────────────────────

export interface ResolveResult {
  value: string;
  /** True if the path was found in the data (false = used default or empty). */
  found: boolean;
}

/**
 * Fully resolve a path against data, applying:
 * 1. Path parsing (cached)
 * 2. Prototype-safe traversal
 * 3. Function auto-invocation
 * 4. Default value fallback
 */
export function resolvePath(
  path: string,
  segments: readonly Segment[],
  defaultValue: string | undefined,
  data: unknown,
  maxDepth: number
): ResolveResult {
  const raw = walk(data, segments, maxDepth);
  const coerced = coerce(raw);

  if (coerced !== null) {
    return { value: coerced, found: true };
  }

  return {
    value: defaultValue ?? '',
    found: false,
  };
}
