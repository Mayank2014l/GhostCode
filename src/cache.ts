import * as crypto from 'crypto';

export interface CacheEntry {
  readonly completion: string;
  readonly createdAt: number;
  readonly model: string;
}

export interface CacheOptions {
  readonly maxEntries?: number;
  readonly ttlMs?: number;
}

const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * High-performance, in-memory LRU cache with SHA-256 context hashing and TTL expiration.
 * No data is persisted to disk.
 */
export class CompletionCache {
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly store: Map<string, CacheEntry>;

  constructor(options?: CacheOptions) {
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
    this.store = new Map<string, CacheEntry>();
  }

  /**
   * Generates a deterministic SHA-256 hash of the normalized context and model.
   */
  public computeKey(prefix: string, suffix: string, model: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(`m:${model}\n`);
    hash.update(`p:${prefix}\n`);
    hash.update(`s:${suffix}`);
    return hash.digest('hex');
  }

  /**
   * Retrieves a cached completion if present and not expired.
   * Updates LRU access ordering on hit.
   */
  public get(prefix: string, suffix: string, model: string): string | undefined {
    const key = this.computeKey(prefix, suffix, model);
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }

    const now = Date.now();
    if (now - entry.createdAt > this.ttlMs) {
      this.store.delete(key);
      return undefined;
    }

    // Refresh LRU position by re-inserting
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.completion;
  }

  /**
   * Stores a completion in the cache, evicting the least recently used item if full.
   */
  public set(prefix: string, suffix: string, model: string, completion: string): void {
    const key = this.computeKey(prefix, suffix, model);

    // If key already exists, delete it so we can push it to MRU position
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      // Evict least recently used (first item in Map iteration)
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    this.store.set(key, {
      completion,
      createdAt: Date.now(),
      model,
    });
  }

  /**
   * Purges all cached entries immediately.
   */
  public clear(): void {
    this.store.clear();
  }

  /**
   * Returns current active number of entries.
   */
  public get size(): number {
    return this.store.size;
  }

  /**
   * Evicts all expired entries from cache.
   */
  public purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now - entry.createdAt > this.ttlMs) {
        this.store.delete(key);
      }
    }
  }
}
