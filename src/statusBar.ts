import * as vscode from 'vscode';
import { UsageStats } from './usage';

export type StatusBarState =
  | 'idle'
  | 'thinking'
  | 'rate-limited'
  | 'disabled'
  | 'private-mode'
  | 'no-key'
  | 'error';

/**
 * Manages the GemComplete status bar indicator and its states.
 */
export class StatusBarManager implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private currentState: StatusBarState = 'idle';
  private lastStats?: UsageStats;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = 'gemcomplete.showUsage';
    this.setState('idle');
    this.item.show();
  }

  public updateUsage(stats: UsageStats): void {
    this.lastStats = stats;
    if (this.currentState === 'idle') {
      this.item.tooltip = `GemComplete Free Quota: ${stats.remainingDailyRequests}/${stats.maxDailyRequests} remaining today (${stats.requestsThisMinute}/${stats.maxRpm} RPM) — Click to open Quota & Settings`;
    }
  }

  public setState(state: StatusBarState, messageOverride?: string): void {
    this.currentState = state;

    switch (state) {
      case 'idle':
        this.item.command = 'gemcomplete.showUsage';
        this.item.text = '$(sparkle) GemComplete';
        this.item.tooltip = this.lastStats
          ? `GemComplete Free Quota: ${this.lastStats.remainingDailyRequests}/${this.lastStats.maxDailyRequests} remaining today (${this.lastStats.requestsThisMinute}/${this.lastStats.maxRpm} RPM) — Click to open Quota & Settings`
          : 'GemComplete: Ready (Free Tier) — Click to view quota & settings';
        this.item.backgroundColor = undefined;
        break;

      case 'thinking':
        this.item.command = 'gemcomplete.showOutputLog';
        this.item.text = '$(sync~spin) GemComplete';
        this.item.tooltip = 'GemComplete: Generating inline completion...';
        this.item.backgroundColor = undefined;
        break;

      case 'rate-limited':
        this.item.command = 'gemcomplete.showUsage';
        this.item.text = '$(warning) GemComplete: Rate limited';
        this.item.tooltip = messageOverride ?? 'GemComplete: Free tier rate limit reached. Click to check limits.';
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        break;

      case 'disabled':
        this.item.command = 'gemcomplete.showUsage';
        this.item.text = '$(circle-slash) GemComplete (off)';
        this.item.tooltip = 'GemComplete: Disabled. Click to view settings and enable.';
        this.item.backgroundColor = undefined;
        break;

      case 'private-mode':
        this.item.command = 'gemcomplete.togglePrivateMode';
        this.item.text = '$(lock) GemComplete [Private]';
        this.item.tooltip = 'GemComplete: Private Mode active (Zero network calls). Click to toggle.';
        this.item.backgroundColor = undefined;
        break;

      case 'no-key':
        this.item.command = 'gemcomplete.setApiKey';
        this.item.text = '$(key) GemComplete: No Key';
        this.item.tooltip = 'GemComplete: Gemini API key not set. Click to configure.';
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        break;

      case 'error':
        this.item.command = 'gemcomplete.showOutputLog';
        this.item.text = '$(error) GemComplete';
        this.item.tooltip = messageOverride ? `GemComplete Error: ${messageOverride}` : 'GemComplete: Error occurred. View Output Log.';
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
    }
  }

  public getState(): StatusBarState {
    return this.currentState;
  }

  public dispose(): void {
    this.item.dispose();
  }
}
