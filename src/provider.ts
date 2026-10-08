import * as vscode from 'vscode';
import { CompletionCache } from './cache';
import { getExtensionConfig } from './config';
import { hasUserConsented } from './consent';
import { buildCompletionContext, checkTriggerEligibility } from './context';
import { requestCompletionWithFallback } from './gemini';
import { StatusBarManager } from './statusBar';
import { UsageTracker } from './usage';

/**
 * GemComplete InlineCompletionItemProvider.
 * Provides real-time AI ghost-text completions at the editor cursor.
 */
export class GemCompleteProvider implements vscode.InlineCompletionItemProvider {
  private activeAbortController: AbortController | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceResolve: ((val: boolean) => void) | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly cache: CompletionCache,
    private readonly statusBar: StatusBarManager,
    private readonly getApiKey: () => Promise<string | undefined>,
    private readonly log: (message: string) => void,
    private readonly usageTracker?: UsageTracker
  ) {}

  public async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | null> {
    // Cancel in-flight network requests on keystroke
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }

    // Cancel pending debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      if (this.debounceResolve) {
        this.debounceResolve(false);
        this.debounceResolve = null;
      }
    }

    if (token.isCancellationRequested) {
      return null;
    }

    const config = getExtensionConfig();

    // Check extension state
    if (!config.enabled) {
      this.statusBar.setState('disabled');
      return null;
    }

    // Check private mode
    if (config.privateMode) {
      this.statusBar.setState('private-mode');
      return null;
    }

    // Check user consent
    if (!hasUserConsented(this.context)) {
      this.log('[Skip] User consent not granted.');
      return null;
    }

    // Check cursor and file trigger eligibility
    const eligibility = checkTriggerEligibility(document, position, config);
    if (!eligibility.eligible) {
      this.log(`[Skip] ${eligibility.reason ?? 'Ineligible'}`);
      return null;
    }

    // Check API Key
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      this.statusBar.setState('no-key');
      this.log('[Skip] Gemini API key not found. Run command "GemComplete: Set API Key".');
      return null;
    }

    // Build context
    const completionContext = buildCompletionContext(document, position, config);

    // Check cache: instant return on cache hit, bypass debounce
    const cached = this.cache.get(completionContext.prefix, completionContext.suffix, config.model);
    if (cached) {
      this.usageTracker?.recordCacheHit();
      if (this.usageTracker) {
        this.statusBar.updateUsage(this.usageTracker.getStats(config.model));
      }
      this.log(`[Cache Hit] Instant completion returned for model ${config.model}`);
      return [new vscode.InlineCompletionItem(cached, new vscode.Range(position, position))];
    }

    // Debounce to conserve API quota while typing (skip debounce on explicit invoke / Alt+\)
    const isManualInvoke = _context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke;
    if (!isManualInvoke && config.debounceMs > 0) {
      const debounced = await this.waitForDebounce(config.debounceMs, token);
      if (!debounced || token.isCancellationRequested) {
        return null;
      }
    }

    // Prepare abort controller for network call
    const abortController = new AbortController();
    this.activeAbortController = abortController;

    const cancellationListener = token.onCancellationRequested(() => {
      abortController.abort();
    });

    try {
      this.log(`[Requesting] Calling ${config.model} for ${document.languageId}...`);
      const result = await requestCompletionWithFallback(
        apiKey,
        completionContext,
        config,
        abortController.signal,
        this.log,
        (state, detail) => {
          // Only update status bar if not aborted
          if (!abortController.signal.aborted) {
            this.statusBar.setState(state, detail);
          }
        }
      );

      if (token.isCancellationRequested || abortController.signal.aborted) {
        return null;
      }

      if (result && result.completion.trim().length > 0) {
        // Record quota usage
        this.usageTracker?.recordRequest(result.tokensUsed);
        if (this.usageTracker) {
          this.statusBar.updateUsage(this.usageTracker.getStats(config.model));
        }

        // Cache the valid suggestion
        this.cache.set(
          completionContext.prefix,
          completionContext.suffix,
          result.modelUsed,
          result.completion
        );

        this.log(`[Success] Returned ${result.completion.length} chars (latency: ${result.latencyMs}ms, model: ${result.modelUsed})`);
        return [new vscode.InlineCompletionItem(result.completion, new vscode.Range(position, position))];
      }

      this.log('[Result] No completion suggestion generated.');
      return null;
    } catch (err: unknown) {
      if (!abortController.signal.aborted) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.log(`[Provider Error] ${errorMsg}`);
        this.statusBar.setState('error', errorMsg);
      }
      return null;
    } finally {
      cancellationListener.dispose();
      if (this.activeAbortController === abortController) {
        this.activeAbortController = null;
      }
    }
  }

  /**
   * Prompts debounce delay, returning false if cancelled before duration completes.
   */
  private waitForDebounce(delayMs: number, token: vscode.CancellationToken): Promise<boolean> {
    return new Promise((resolve) => {
      this.debounceResolve = resolve;
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        this.debounceResolve = null;
        resolve(true);
      }, delayMs);

      token.onCancellationRequested(() => {
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
          this.debounceTimer = null;
        }
        this.debounceResolve = null;
        resolve(false);
      });
    });
  }
}
