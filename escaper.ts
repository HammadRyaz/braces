// ─────────────────────────────────────────────────────────────────────────────
// braces/escaper.ts — HTML/Attribute/URL Escaping
//
// Why a separate module?
//   Escaping is a security concern orthogonal to template rendering.
//   Keeping it isolated makes it auditable, testable, and replaceable.
//
// Strategy:
//   The HTML escape regex is compiled ONCE at module load time.
//   The replace callback uses a direct object literal lookup — no Map,
//   no switch, no branch tree. Modern V8 compiles this to a perfect hash.
//
// Character coverage:
//   OWASP recommends escaping at minimum: & < > " '
//   We add backtick (`) because it is used for attribute injection in
//   IE-style template strings: <div style=`...`>.
//   We skip `/` unlike some implementations — it is safe in HTML content and
//   escaping it breaks rendering of paths like "/about" as text.
// ─────────────────────────────────────────────────────────────────────────────

/** @internal — OWASP minimum + backtick. Compiled once, never mutated. */
const HTML_CHARS: Readonly<Record<string, string>> = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '`': '&#x60;',
});

/** @internal — includes backtick; anchored to content chars, not `/` */
const HTML_RE = /[&<>"'`]/g;

/**
 * Escape HTML-unsafe characters to prevent XSS in HTML contexts.
 *
 * Use when rendering user-supplied values into:
 * - HTML element content
 * - HTML attribute values (quoted)
 * - HTML data attributes
 *
 * Escapes: `& < > " ' \``
 *
 * @example
 * escapeHtml('<script>alert("xss")</script>')
 * // → '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 */
export function escapeHtml(value: string): string {
  return value.replace(HTML_RE, (c) => HTML_CHARS[c] ?? c);
}

// ── Attribute escaper ─────────────────────────────────────────────────────────

/**
 * Escape a value for safe insertion inside a quoted HTML attribute.
 * More aggressive than `escapeHtml` — also neutralises newlines and tabs
 * that could break out of attributes in some parsers.
 *
 * @example
 * escapeAttr('O\'Brien\nHacker')
 * // → 'O&#x27;Brien Hacker'
 */
export function escapeAttr(value: string): string {
  return escapeHtml(value)
    .replace(/\r?\n|\r/g, ' ')
    .replace(/\t/g, ' ');
}

// ── URL escaper (re-exported for convenience) ─────────────────────────────────

/**
 * Encode a string as a safe URI component.
 * Delegates to the native `encodeURIComponent` — no reinvention.
 *
 * Use for path segments and query parameter values, NOT full URLs.
 *
 * @example
 * escapeUrl('hello world & more')
 * // → 'hello%20world%20%26%20more'
 */
export function escapeUrl(value: string): string {
  return encodeURIComponent(value);
}
