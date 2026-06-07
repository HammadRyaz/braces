// ─────────────────────────────────────────────────────────────────────────────
// braces/cache.ts — O(1) LRU Cache
//
// WHY NOT A MAP?
//   A plain Map with "delete oldest key" is O(n) for eviction because
//   Map.prototype.keys().next() iterates the entire bucket chain. An LRU
//   backed by a doubly-linked list achieves O(1) get, set, and eviction.
//
// WHY NOT WeakMap?
//   Template strings are primitives — they cannot be WeakMap keys.
//
// IMPLEMENTATION:
//   A doubly-linked list maintains insertion/access order.
//   A Map provides O(1) key lookup to any list node.
//   Together they form the classic LRU structure used in:
//   - Node.js's own require() cache
//   - V8's hidden-class caches
//   - React's memo() bailout logic
//
//   head ← MRU (most recently used)
//   tail → LRU (least recently used, evicted next)
// ─────────────────────────────────────────────────────────────────────────────

interface DLNode<K, V> {
  key: K;
  value: V;
  prev: DLNode<K, V> | null;
  next: DLNode<K, V> | null;
}

export class LRUCache<K, V> {
  private readonly map = new Map<K, DLNode<K, V>>();
  private head: DLNode<K, V> | null = null; // MRU sentinel
  private tail: DLNode<K, V> | null = null; // LRU sentinel
  private readonly cap: number;

  /**
   * @param capacity - Maximum number of entries. Must be >= 1.
   */
  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`LRUCache capacity must be a positive integer, got ${capacity}`);
    }
    this.cap = capacity;
  }

  /** O(1) — returns undefined on cache miss. Promotes entry to MRU on hit. */
  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (node === undefined) return undefined;
    if (node !== this.head) this.promote(node);
    return node.value;
  }

  /** O(1) — inserts or updates. Evicts LRU entry if over capacity. */
  set(key: K, value: V): this {
    const existing = this.map.get(key);
    if (existing !== undefined) {
      existing.value = value;
      if (existing !== this.head) this.promote(existing);
      return this;
    }

    const node: DLNode<K, V> = { key, value, prev: null, next: this.head };

    if (this.head !== null) this.head.prev = node;
    this.head = node;
    if (this.tail === null) this.tail = node;

    this.map.set(key, node);

    if (this.map.size > this.cap) this.evict();
    return this;
  }

  /** O(1) — returns true if the key exists (without promoting). */
  has(key: K): boolean {
    return this.map.has(key);
  }

  /** O(1) */
  delete(key: K): boolean {
    const node = this.map.get(key);
    if (node === undefined) return false;
    this.unlink(node);
    this.map.delete(key);
    return true;
  }

  /** O(n) — clears all entries. */
  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
  }

  get size(): number {
    return this.map.size;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Move an existing node to the head (MRU) position. */
  private promote(node: DLNode<K, V>): void {
    this.unlink(node);
    node.next = this.head;
    node.prev = null;
    if (this.head !== null) this.head.prev = node;
    this.head = node;
    if (this.tail === null) this.tail = node;
  }

  /** Remove a node from the doubly-linked list without touching the Map. */
  private unlink(node: DLNode<K, V>): void {
    if (node.prev !== null) node.prev.next = node.next;
    else this.head = node.next;

    if (node.next !== null) node.next.prev = node.prev;
    else this.tail = node.prev;

    node.prev = null;
    node.next = null;
  }

  /** Evict the tail (LRU) node. */
  private evict(): void {
    if (this.tail === null) return;
    const lru = this.tail;
    this.unlink(lru);
    this.map.delete(lru.key);
  }
}
