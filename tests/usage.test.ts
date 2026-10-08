import * as assert from 'assert';
import * as vscode from 'vscode';
import { UsageTracker } from '../src/usage';

suite('UsageTracker Quota & Rate Limit Test Suite', () => {
  let mockContext: vscode.ExtensionContext;
  let storageMap: Map<string, unknown>;

  setup(() => {
    storageMap = new Map();
    mockContext = {
      globalState: {
        get: <T>(key: string): T | undefined => storageMap.get(key) as T | undefined,
        update: async (key: string, value: unknown): Promise<void> => {
          storageMap.set(key, value);
        },
      },
    } as unknown as vscode.ExtensionContext;
  });

  test('1. Initializes default free tier quota correctly', () => {
    const tracker = new UsageTracker(mockContext);
    const stats = tracker.getStats('gemini-3.1-flash-lite');

    assert.strictEqual(stats.requestsToday, 0);
    assert.strictEqual(stats.maxDailyRequests, 1500);
    assert.strictEqual(stats.remainingDailyRequests, 1500);
    assert.strictEqual(stats.percentDailyUsed, 0);
    assert.strictEqual(stats.requestsThisMinute, 0);
    assert.strictEqual(stats.maxRpm, 15);
    assert.strictEqual(stats.isFreeTier, true);
    assert.strictEqual(stats.tokensToday, 0);
    assert.strictEqual(stats.cacheHitsToday, 0);
  });

  test('2. Accurately records requests and tokens', () => {
    const tracker = new UsageTracker(mockContext);
    tracker.recordRequest(120);
    tracker.recordRequest(80);

    const stats = tracker.getStats('gemini-3.1-flash-lite');
    assert.strictEqual(stats.requestsToday, 2);
    assert.strictEqual(stats.tokensToday, 200);
    assert.strictEqual(stats.remainingDailyRequests, 1498);
    assert.strictEqual(stats.requestsThisMinute, 2);
  });

  test('3. Accurately tracks cache hits and cache savings percentage', () => {
    const tracker = new UsageTracker(mockContext);
    tracker.recordRequest(50);
    tracker.recordCacheHit();
    tracker.recordCacheHit();
    tracker.recordCacheHit();

    const stats = tracker.getStats('gemini-3.1-flash-lite');
    assert.strictEqual(stats.requestsToday, 1);
    assert.strictEqual(stats.cacheHitsToday, 3);
    // 3 cache hits out of 4 total inquiries = 75% saved
    assert.strictEqual(stats.cacheSavingsPercent, 75);
  });

  test('4. Resets stats when resetStats is called', () => {
    const tracker = new UsageTracker(mockContext);
    tracker.recordRequest(50);
    tracker.recordCacheHit();
    tracker.resetStats();

    const stats = tracker.getStats('gemini-3.1-flash-lite');
    assert.strictEqual(stats.requestsToday, 0);
    assert.strictEqual(stats.tokensToday, 0);
    assert.strictEqual(stats.cacheHitsToday, 0);
    assert.strictEqual(stats.remainingDailyRequests, 1500);
  });
});
