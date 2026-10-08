import * as vscode from 'vscode';

export interface UsageStats {
  readonly requestsToday: number;
  readonly maxDailyRequests: number;
  readonly remainingDailyRequests: number;
  readonly percentDailyUsed: number;
  readonly requestsThisMinute: number;
  readonly maxRpm: number;
  readonly percentRpmUsed: number;
  readonly tokensToday: number;
  readonly cacheHitsToday: number;
  readonly cacheSavingsPercent: number;
  readonly resetTimeStr: string;
  readonly isFreeTier: boolean;
  readonly activeModel: string;
}

interface PersistedUsage {
  dateStr: string;
  requests: number;
  tokens: number;
  cacheHits: number;
}

const STORAGE_KEY = 'gemcomplete.usageTracking';
const MAX_FREE_RPD = 1500; // Gemini Flash Free Tier Daily Limit
const MAX_FREE_RPM = 15;   // Gemini Flash Free Tier Minute Limit

export class UsageTracker {
  private recentTimestamps: number[] = [];
  private currentUsage: PersistedUsage;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.currentUsage = this.loadUsage();
  }

  private getTodayString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private loadUsage(): PersistedUsage {
    const today = this.getTodayString();
    const stored = this.context.globalState.get<PersistedUsage>(STORAGE_KEY);

    if (stored && stored.dateStr === today) {
      return stored;
    }

    // New day or first run: initialize
    const fresh: PersistedUsage = {
      dateStr: today,
      requests: 0,
      tokens: 0,
      cacheHits: 0,
    };
    this.context.globalState.update(STORAGE_KEY, fresh);
    return fresh;
  }

  private checkDayRollover(): void {
    const today = this.getTodayString();
    if (this.currentUsage.dateStr !== today) {
      this.currentUsage = {
        dateStr: today,
        requests: 0,
        tokens: 0,
        cacheHits: 0,
      };
      this.context.globalState.update(STORAGE_KEY, this.currentUsage);
    }
  }

  public recordRequest(tokensUsed?: number): void {
    this.checkDayRollover();
    this.currentUsage.requests += 1;
    if (tokensUsed && tokensUsed > 0) {
      this.currentUsage.tokens += tokensUsed;
    }
    this.context.globalState.update(STORAGE_KEY, this.currentUsage);

    // Track sliding 60-second window for RPM
    const now = Date.now();
    this.recentTimestamps.push(now);
    this.cleanRecentTimestamps(now);
  }

  public recordCacheHit(): void {
    this.checkDayRollover();
    this.currentUsage.cacheHits += 1;
    this.context.globalState.update(STORAGE_KEY, this.currentUsage);
  }

  private cleanRecentTimestamps(now: number): void {
    const cutoff = now - 60000;
    this.recentTimestamps = this.recentTimestamps.filter((ts) => ts > cutoff);
  }

  public getStats(activeModel: string = 'gemini-3.1-flash-lite'): UsageStats {
    this.checkDayRollover();
    const now = Date.now();
    this.cleanRecentTimestamps(now);

    const requestsToday = this.currentUsage.requests;
    const tokensToday = this.currentUsage.tokens;
    const cacheHitsToday = this.currentUsage.cacheHits;
    const requestsThisMinute = this.recentTimestamps.length;

    const remainingDailyRequests = Math.max(0, MAX_FREE_RPD - requestsToday);
    const percentDailyUsed = Math.min(100, Math.round((requestsToday / MAX_FREE_RPD) * 100));
    const percentRpmUsed = Math.min(100, Math.round((requestsThisMinute / MAX_FREE_RPM) * 100));

    const totalInquiries = requestsToday + cacheHitsToday;
    const cacheSavingsPercent = totalInquiries > 0 ? Math.round((cacheHitsToday / totalInquiries) * 100) : 0;

    // Reset occurs at midnight local time
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const resetTimeStr = `Midnight (12:00 AM)`;

    return {
      requestsToday,
      maxDailyRequests: MAX_FREE_RPD,
      remainingDailyRequests,
      percentDailyUsed,
      requestsThisMinute,
      maxRpm: MAX_FREE_RPM,
      percentRpmUsed,
      tokensToday,
      cacheHitsToday,
      cacheSavingsPercent,
      resetTimeStr,
      isFreeTier: true,
      activeModel,
    };
  }

  public resetStats(): void {
    const today = this.getTodayString();
    this.currentUsage = {
      dateStr: today,
      requests: 0,
      tokens: 0,
      cacheHits: 0,
    };
    this.recentTimestamps = [];
    this.context.globalState.update(STORAGE_KEY, this.currentUsage);
  }
}
