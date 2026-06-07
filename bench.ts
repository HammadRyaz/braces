// ─────────────────────────────────────────────────────────────────────────────
// braces — Benchmark Suite
//
// Methodology:
//   1. Warm-up runs ensure the V8 JIT has compiled the hot paths
//   2. We measure in OPERATIONS PER SECOND (higher = better)
//   3. Each benchmark runs for a fixed duration (not fixed iterations)
//      to get statistically stable results regardless of machine speed
//   4. We test distinct scenarios that represent real production usage
//
// Run with: node --loader ts-node/esm benchmarks/bench.ts
// ─────────────────────────────────────────────────────────────────────────────

import { render, precompile, createRenderer } from '../src/index.js';

// ── Benchmark harness ─────────────────────────────────────────────────────────

function bench(name: string, fn: () => void, durationMs = 2000): void {
  // Warm-up: let V8 JIT compile the function
  for (let i = 0; i < 1000; i++) fn();

  const start = Date.now();
  let ops = 0;
  while (Date.now() - start < durationMs) {
    fn();
    fn();
    fn();
    fn();
    fn();
    ops += 5;
  }
  const elapsed = Date.now() - start;
  const opsPerSec = Math.round((ops / elapsed) * 1000);
  console.log(`  ${name.padEnd(45)} ${opsPerSec.toLocaleString().padStart(12)} ops/sec`);
}

// ── Test data ─────────────────────────────────────────────────────────────────

const simpleData  = { name: 'Alice' };
const multiData   = { first: 'Alice', last: 'Smith', age: 30, city: 'London' };
const nestedData  = { user: { profile: { name: 'Alice', score: 9800 } } };
const arrayData   = { items: ['Alpha', 'Beta', 'Gamma'] };
const filterData  = { name: '  alice  ' };

// ── Templates ─────────────────────────────────────────────────────────────────

const T_SIMPLE   = 'Hello {name}!';
const T_MULTI    = 'Name: {first} {last}, Age: {age}, City: {city}';
const T_NESTED   = 'User: {user.profile.name}, Score: {user.profile.score}';
const T_ARRAY    = 'Items: {items[0]}, {items[1]}, {items[2]}';
const T_FILTER   = 'Hello {name|trim|capitalize}!';
const T_DEFAULT  = 'Hello {name:Guest}, welcome to {place:Earth}!';
const T_NOVAR    = 'This template has absolutely no placeholders at all.';
const T_LONG     = `
  <!DOCTYPE html>
  <html>
    <head><title>{user.profile.name} — Dashboard</title></head>
    <body>
      <h1>Welcome back, {user.profile.name}!</h1>
      <p>Your score is {user.profile.score}.</p>
      <p>Top items: {items[0]}, {items[1]}, {items[2]}</p>
    </body>
  </html>
`;

// ── Precompiled versions (parsed once) ────────────────────────────────────────

const compiled_simple  = precompile(T_SIMPLE);
const compiled_multi   = precompile(T_MULTI);
const compiled_nested  = precompile(T_NESTED);
const compiled_array   = precompile(T_ARRAY);
const compiled_filter  = precompile(T_FILTER);
const compiled_long    = precompile(T_LONG);

// ── Renderer instance ─────────────────────────────────────────────────────────

const renderer   = createRenderer({ escapeHtml: true });
const r_compiled = renderer.precompile(T_SIMPLE);

// ─────────────────────────────────────────────────────────────────────────────

console.log('\n🔬 braces v2 — Benchmark Results\n');
console.log('  Each benchmark runs for 2 seconds (higher ops/sec = better)\n');

console.log('── render() with cache (first call parses, subsequent calls reuse) ─\n');
bench('Simple: render(T_SIMPLE, simpleData)',                 () => render(T_SIMPLE, simpleData));
bench('Multi:  render(T_MULTI, multiData)',                   () => render(T_MULTI, multiData));
bench('Nested: render(T_NESTED, nestedData)',                 () => render(T_NESTED, nestedData));
bench('Array:  render(T_ARRAY, arrayData)',                   () => render(T_ARRAY, arrayData));
bench('Filter: render(T_FILTER, filterData)',                 () => render(T_FILTER, filterData));
bench('Default: render(T_DEFAULT, {})',                       () => render(T_DEFAULT, {}));
bench('NoVar:  render(T_NOVAR) [fast path]',                  () => render(T_NOVAR));
bench('Long HTML template (8 placeholders)',                   () => render(T_LONG, { ...nestedData, items: arrayData.items }));

console.log('\n── precompile() — zero parsing cost per call ─────────────────────\n');
bench('Simple compiled',  () => compiled_simple(simpleData));
bench('Multi compiled',   () => compiled_multi(multiData));
bench('Nested compiled',  () => compiled_nested(nestedData));
bench('Array compiled',   () => compiled_array(arrayData));
bench('Filter compiled',  () => compiled_filter(filterData));
bench('Long HTML compiled', () => compiled_long({ ...nestedData, items: arrayData.items }));

console.log('\n── createRenderer() instance — isolated cache ────────────────────\n');
bench('renderer.render(T_SIMPLE)',          () => renderer.render(T_SIMPLE, simpleData));
bench('precompiled from renderer instance', () => r_compiled(simpleData));

console.log('\n── Baseline comparisons ──────────────────────────────────────────\n');
// Naive string replace (what most devs do without a library)
bench('Naive: str.replace("{name}", value)',
  () => 'Hello {name}!'.replace('{name}', 'Alice'));

// Regex replace
const naiveRe = /\{(\w+)\}/g;
bench('Naive: str.replace(regex, fn)',
  () => 'Hello {name}!'.replace(naiveRe, (_, k) => ({ name: 'Alice' } as Record<string,string>)[k] ?? ''));

console.log('\n');
