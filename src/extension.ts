import * as vscode from 'vscode';
import { CompletionCache } from './cache';
import { getExtensionConfig, updateExtensionConfig } from './config';
import { hasUserConsented, promptForConsent, setUserConsent } from './consent';
import { showDashboardWebview, showUsageQuickPick } from './dashboard';
import { GemCompleteProvider } from './provider';
import { redactLogMessage } from './redact';
import { StatusBarManager } from './statusBar';
import { UsageTracker } from './usage';

const SECRET_API_KEY_NAME = 'gemcomplete.apiKey';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel('GemComplete');
  context.subscriptions.push(outputChannel);

  const log = (message: string): void => {
    const timestamp = new Date().toISOString().slice(11, 19);
    outputChannel.appendLine(`[${timestamp}] ${redactLogMessage(message)}`);
  };

  log('[Startup] GemComplete activating...');

  // Initialize in-memory LRU cache
  const cache = new CompletionCache({ maxEntries: 100, ttlMs: 5 * 60 * 1000 });
  const usageTracker = new UsageTracker(context);
  const statusBar = new StatusBarManager();
  context.subscriptions.push(statusBar);

  // Cache API key in memory to avoid repetitive OS keychain calls on every keystroke
  let inMemoryApiKey: string | undefined;

  const getApiKey = async (): Promise<string | undefined> => {
    if (inMemoryApiKey) {
      return inMemoryApiKey;
    }
    const stored = await context.secrets.get(SECRET_API_KEY_NAME);
    if (stored && stored.trim().length > 0) {
      inMemoryApiKey = stored.trim();
      return inMemoryApiKey;
    }
    const envKey = process.env.GEMINI_API_KEY;
    if (envKey && envKey.trim().length > 0) {
      return envKey.trim();
    }
    return undefined;
  };

  const provider = new GemCompleteProvider(context, cache, statusBar, getApiKey, log, usageTracker);
  // Universal document selector matching regular files, notebook cells, and untitled editors
  const documentSelector: vscode.DocumentSelector = [
    { scheme: 'file' },
    { scheme: 'vscode-notebook-cell' },
    { scheme: 'untitled' },
    '*',
  ];
  const providerRegistration = vscode.languages.registerInlineCompletionItemProvider(
    documentSelector,
    provider
  );
  context.subscriptions.push(providerRegistration);

  // Function to refresh status bar based on configuration and key
  const refreshStatus = async (): Promise<void> => {
    const config = getExtensionConfig();
    statusBar.updateUsage(usageTracker.getStats(config.model));
    if (!config.enabled) {
      statusBar.setState('disabled');
      return;
    }
    if (config.privateMode) {
      statusBar.setState('private-mode');
      return;
    }
    const key = await getApiKey();
    if (!key) {
      statusBar.setState('no-key');
      return;
    }
    statusBar.setState('idle');
  };

  await refreshStatus();

  // Listen to configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('gemcomplete')) {
        log('[Config] GemComplete configuration updated.');
        await refreshStatus();
      }
    })
  );

  // Command: Toggle On/Off
  const toggleCommand = vscode.commands.registerCommand('gemcomplete.toggle', async () => {
    const config = getExtensionConfig();
    const newEnabled = !config.enabled;
    await updateExtensionConfig('enabled', newEnabled);
    vscode.window.showInformationMessage(
      `GemComplete is now ${newEnabled ? 'enabled' : 'disabled'}.`
    );
  });
  context.subscriptions.push(toggleCommand);

  // Command: Show Usage & Quota QuickPick (matching Copilot menu)
  const showUsageCommand = vscode.commands.registerCommand('gemcomplete.showUsage', async () => {
    await showUsageQuickPick(context, usageTracker);
  });
  context.subscriptions.push(showUsageCommand);

  // Command: Open Visual Usage Dashboard (Webview)
  const openDashboardCommand = vscode.commands.registerCommand('gemcomplete.openDashboard', () => {
    showDashboardWebview(context, usageTracker);
  });
  context.subscriptions.push(openDashboardCommand);

  // Command: Toggle Private Mode
  const togglePrivateModeCommand = vscode.commands.registerCommand('gemcomplete.togglePrivateMode', async () => {
    const config = getExtensionConfig();
    const newPrivate = !config.privateMode;
    await updateExtensionConfig('privateMode', newPrivate);
    vscode.window.showInformationMessage(
      `GemComplete Private Mode: ${newPrivate ? 'ON (Zero network calls)' : 'OFF'}`
    );
  });
  context.subscriptions.push(togglePrivateModeCommand);

  // Command: Set API Key
  const setApiKeyCommand = vscode.commands.registerCommand('gemcomplete.setApiKey', async () => {
    const inputKey = await vscode.window.showInputBox({
      title: 'GemComplete: Set Google Gemini API Key',
      prompt: 'Enter your Google Gemini API key (stored securely in VS Code SecretStorage)',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        const trimmed = value.trim();
        if (!trimmed) {
          return 'API key cannot be empty';
        }
        if (!/^AIza[0-9A-Za-z\-_]{35}$/.test(trimmed) && trimmed.length < 20) {
          return 'Warning: Typically Gemini API keys start with "AIza" and are 39 characters.';
        }
        return null;
      },
    });

    if (inputKey !== undefined) {
      const trimmed = inputKey.trim();
      if (trimmed) {
        inMemoryApiKey = trimmed;
        await context.secrets.store(SECRET_API_KEY_NAME, trimmed);
        await setUserConsent(context, true);
        log('[Auth] Gemini API key stored securely in SecretStorage and consent confirmed.');
        vscode.window.showInformationMessage('GemComplete: Gemini API key saved securely. Inline completions are active!');
        await refreshStatus();
      }
    }
  });
  context.subscriptions.push(setApiKeyCommand);

  // Command: Clear API Key
  const clearApiKeyCommand = vscode.commands.registerCommand('gemcomplete.clearApiKey', async () => {
    const confirm = await vscode.window.showWarningMessage(
      'Are you sure you want to clear your stored Gemini API key?',
      { modal: true },
      'Yes, Clear Key'
    );
    if (confirm === 'Yes, Clear Key') {
      inMemoryApiKey = undefined;
      await context.secrets.delete(SECRET_API_KEY_NAME);
      log('[Auth] Gemini API key removed from SecretStorage.');
      vscode.window.showInformationMessage('GemComplete: Gemini API key removed.');
      await refreshStatus();
    }
  });
  context.subscriptions.push(clearApiKeyCommand);

  // Command: Clear Cache
  const clearCacheCommand = vscode.commands.registerCommand('gemcomplete.clearCache', () => {
    const count = cache.size;
    cache.clear();
    log(`[Cache] Cleared ${count} cached completions.`);
    vscode.window.showInformationMessage(`GemComplete: Cache cleared (${count} items removed).`);
  });
  context.subscriptions.push(clearCacheCommand);

  // Command: Show Output Log
  const showOutputLogCommand = vscode.commands.registerCommand('gemcomplete.showOutputLog', () => {
    outputChannel.show();
  });
  context.subscriptions.push(showOutputLogCommand);

  // Command: Manual Trigger Completion
  const triggerCommand = vscode.commands.registerCommand('gemcomplete.trigger', async () => {
    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
  });
  context.subscriptions.push(triggerCommand);

  // First-run checks: Consent and API Key
  setTimeout(async () => {
    if (!hasUserConsented(context)) {
      const consented = await promptForConsent(context);
      if (!consented) {
        return;
      }
    }

    const key = await getApiKey();
    if (!key) {
      const SET_KEY = 'Set API Key';
      const GET_KEY = 'Get Free API Key';
      const choice = await vscode.window.showInformationMessage(
        'GemComplete is active, but your Google Gemini API key is missing. Add your free key to start receiving inline completions.',
        SET_KEY,
        GET_KEY
      );

      if (choice === SET_KEY) {
        await vscode.commands.executeCommand('gemcomplete.setApiKey');
      } else if (choice === GET_KEY) {
        vscode.env.openExternal(vscode.Uri.parse('https://aistudio.google.com/apikey'));
      }
    }

    // Verify VS Code inline suggestions setting is enabled
    const inlineSuggest = vscode.workspace.getConfiguration('editor').get<boolean>('inlineSuggest.enabled');
    if (inlineSuggest === false) {
      const enableChoice = await vscode.window.showWarningMessage(
        'GemComplete: VS Code inline suggestions ("editor.inlineSuggest.enabled") are disabled in your settings.',
        'Enable Inline Suggestions'
      );
      if (enableChoice === 'Enable Inline Suggestions') {
        await vscode.workspace.getConfiguration('editor').update('inlineSuggest.enabled', true, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('GemComplete: Inline suggestions enabled successfully.');
      }
    }
  }, 1000);

  log('[Startup] GemComplete activated successfully.');
}

export function deactivate(): void {
  // Clear any sensitive in-memory state
}
