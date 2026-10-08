import * as assert from 'assert';
import { CompletionCache } from '../src/cache';

suite('In-Memory CompletionCache Test Suite', () => {
  test('1. Computes deterministic SHA-256 keys', () => {
    const cache = new CompletionCache();
    const key1 = cache.computeKey('function foo() {', '\n}', 'gemini-2.5-flash');
    const key2 = cache.computeKey('function foo() {', '\n}', 'gemini-2.5-flash');
    const key3 = cache.computeKey('function bar() {', '\n}', 'gemini-2.5-flash');

    assert.strictEqual(key1, key2);
    assert.notStrictEqual(key1, key3);
    assert.strictEqual(key1.length, 64); // SHA-256 hex length
  });

  test('2. Stores and retrieves completions', () => {
    const cache = new CompletionCache({ maxEntries: 10, ttlMs: 10000 });
    cache.set('prefix1', 'suffix1', 'gemini-2.5-flash', 'return 42;');

    const hit = cache.get('prefix1', 'suffix1', 'gemini-2.5-flash');
    assert.strictEqual(hit, 'return 42;');

    const miss = cache.get('differentPrefix', 'suffix1', 'gemini-2.5-flash');
    assert.strictEqual(miss, undefined);
  });

  test('3. Enforces LRU capacity eviction', () => {
    const cache = new CompletionCache({ maxEntries: 3, ttlMs: 10000 });

    cache.set('p1', 's1', 'm', 'c1');
    cache.set('p2', 's2', 'm', 'c2');
    cache.set('p3', 's3', 'm', 'c3');
    assert.strictEqual(cache.size, 3);

    // Access p1 so it becomes the most recently used
    assert.strictEqual(cache.get('p1', 's1', 'm'), 'c1');

    // Insert p4 -> should evict p2 (since p1 was accessed recently, p2 became the oldest)
    cache.set('p4', 's4', 'm', 'c4');
    assert.strictEqual(cache.size, 3);

    assert.strictEqual(cache.get('p2', 's2', 'm'), undefined, 'p2 should have been evicted');
    assert.strictEqual(cache.get('p1', 's1', 'm'), 'c1', 'p1 should still be present');
    assert.strictEqual(cache.get('p3', 's3', 'm'), 'c3', 'p3 should still be present');
    assert.strictEqual(cache.get('p4', 's4', 'm'), 'c4', 'p4 should be present');
  });

  test('4. Enforces TTL expiration', async () => {
    const cache = new CompletionCache({ maxEntries: 10, ttlMs: 50 }); // 50ms TTL

    cache.set('p', 's', 'm', 'quick-result');
    assert.strictEqual(cache.get('p', 's', 'm'), 'quick-result');

    // Wait 60ms to exceed TTL
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert.strictEqual(cache.get('p', 's', 'm'), undefined, 'Entry should have expired');
  });

  test('5. Clear method purges all entries', () => {
    const cache = new CompletionCache();
    cache.set('a', 'b', 'm', '1');
    cache.set('c', 'd', 'm', '2');
    assert.strictEqual(cache.size, 2);

    cache.clear();
    assert.strictEqual(cache.size, 0);
    assert.strictEqual(cache.get('a', 'b', 'm'), undefined);
  });
});
