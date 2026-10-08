import * as vscode from 'vscode';
import { getExtensionConfig, updateExtensionConfig } from './config';
import { UsageTracker } from './usage';

let currentPanel: vscode.WebviewPanel | undefined;

/**
 * Displays an interactive QuickPick menu from the status bar with live quota stats and toggles.
 */
export async function showUsageQuickPick(
  context: vscode.ExtensionContext,
  usageTracker: UsageTracker
): Promise<void> {
  const config = getExtensionConfig();
  const stats = usageTracker.getStats(config.model);

  const dailyProgress = `${stats.requestsToday} / ${stats.maxDailyRequests} (${stats.percentDailyUsed}% used)`;
  const rpmProgress = `${stats.requestsThisMinute} / ${stats.maxRpm} RPM (${stats.percentRpmUsed}%)`;
  const isPythonDisabled = config.disabledLanguages.includes('python');

  const items: (vscode.QuickPickItem & { action?: () => Promise<void> | void })[] = [
    {
      label: `$(sparkle) GemComplete: Gemini Free Tier`,
      description: `Model: ${config.model}`,
      detail: `Free of charge via Google AI Studio API key`,
    },
    {
      label: `$(graph) Daily Quota: ${dailyProgress}`,
      description: `Remaining: ${stats.remainingDailyRequests} requests`,
      detail: `Resets daily at ${stats.resetTimeStr}`,
    },
    {
      label: `$(dashboard) Live Rate Limit: ${rpmProgress}`,
      description: stats.requestsThisMinute >= stats.maxRpm ? 'Warning: High' : 'Status: Normal',
      detail: `Free tier limit is 15 requests per minute`,
    },
    {
      label: `$(database) Cache Saved: ${stats.cacheHitsToday} calls (${stats.cacheSavingsPercent}% quota preserved)`,
      description: `Instant RAM responses`,
    },
    {
      label: '',
      kind: vscode.QuickPickItemKind.Separator,
    },
    {
      label: config.enabled ? '$(check) Ghost Text Suggestions' : '$(circle-slash) Ghost Text Suggestions',
      description: config.enabled ? 'Enabled' : 'Disabled',
      detail: 'Click to toggle AI inline ghost text completions on/off',
      action: async () => {
        await updateExtensionConfig('enabled', !config.enabled);
        vscode.window.showInformationMessage(`GemComplete is now ${!config.enabled ? 'Enabled' : 'Disabled'}.`);
      },
    },
    {
      label: !isPythonDisabled ? '$(check) Suggestions for Python' : '$(circle-slash) Suggestions for Python',
      description: !isPythonDisabled ? 'Enabled' : 'Disabled',
      detail: 'Click to toggle Python completions on/off',
      action: async () => {
        let updated: string[];
        if (isPythonDisabled) {
          updated = config.disabledLanguages.filter((l) => l !== 'python');
        } else {
          updated = [...config.disabledLanguages, 'python'];
        }
        await updateExtensionConfig('disabledLanguages', updated);
        vscode.window.showInformationMessage(`Python suggestions ${isPythonDisabled ? 'Enabled' : 'Disabled'}.`);
      },
    },
    {
      label: config.privateMode ? '$(lock) Private Mode' : '$(unlock) Private Mode',
      description: config.privateMode ? 'ON (Zero network calls)' : 'OFF',
      detail: 'Click to toggle network isolation',
      action: async () => {
        await updateExtensionConfig('privateMode', !config.privateMode);
      },
    },
    {
      label: '',
      kind: vscode.QuickPickItemKind.Separator,
    },
    {
      label: '$(browser) Open Visual Usage Dashboard',
      description: 'Copilot-style visual status card',
      action: () => {
        showDashboardWebview(context, usageTracker);
      },
    },
    {
      label: '$(key) Set / Change Gemini API Key',
      action: () => {
        vscode.commands.executeCommand('gemcomplete.setApiKey');
      },
    },
    {
      label: '$(trash) Clear In-Memory Cache',
      action: () => {
        vscode.commands.executeCommand('gemcomplete.clearCache');
      },
    },
    {
      label: '$(output) View Output Log',
      action: () => {
        vscode.commands.executeCommand('gemcomplete.showOutputLog');
      },
    },
  ];

  const selected = await vscode.window.showQuickPick(items, {
    title: 'GemComplete: Usage Quota & Settings',
    placeHolder: 'View your free Gemini quota, toggle features, or manage keys...',
  });

  if (selected?.action) {
    await selected.action();
  }
}

/**
 * Renders the Visual Webview Dashboard matching the Copilot Free card in the user's screenshot.
 */
export function showDashboardWebview(
  context: vscode.ExtensionContext,
  usageTracker: UsageTracker
): void {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Beside);
    currentPanel.webview.html = getWebviewHtml(usageTracker);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    'gemcompleteDashboard',
    'GemComplete Free Quota',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  currentPanel.webview.html = getWebviewHtml(usageTracker);

  // Handle messages from the webview
  currentPanel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case 'toggleEnabled': {
          await updateExtensionConfig('enabled', message.value);
          currentPanel!.webview.html = getWebviewHtml(usageTracker);
          break;
        }
        case 'togglePython': {
          const config = getExtensionConfig();
          let updated: string[];
          if (message.value) {
            updated = config.disabledLanguages.filter((l) => l !== 'python');
          } else {
            updated = [...config.disabledLanguages, 'python'];
          }
          await updateExtensionConfig('disabledLanguages', updated);
          currentPanel!.webview.html = getWebviewHtml(usageTracker);
          break;
        }
        case 'setApiKey':
          await vscode.commands.executeCommand('gemcomplete.setApiKey');
          currentPanel!.webview.html = getWebviewHtml(usageTracker);
          break;
        case 'clearCache':
          await vscode.commands.executeCommand('gemcomplete.clearCache');
          currentPanel!.webview.html = getWebviewHtml(usageTracker);
          break;
        case 'showLog':
          await vscode.commands.executeCommand('gemcomplete.showOutputLog');
          break;
        case 'openAiStudio':
          vscode.env.openExternal(vscode.Uri.parse('https://aistudio.google.com/'));
          break;
        case 'refresh':
          currentPanel!.webview.html = getWebviewHtml(usageTracker);
          break;
      }
    },
    undefined,
    context.subscriptions
  );

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
  });
}

function getWebviewHtml(usageTracker: UsageTracker): string {
  const config = getExtensionConfig();
  const stats = usageTracker.getStats(config.model);
  const isPythonDisabled = config.disabledLanguages.includes('python');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GemComplete Free Quota</title>
  <style>
    :root {
      --bg: #181818;
      --card-bg: #1f1f1f;
      --border: #333333;
      --text: #e0e0e0;
      --text-muted: #888888;
      --accent: #29b6f6;
      --accent-hover: #0288d1;
      --progress-bg: #2d2d2d;
      --success: #4caf50;
      --warning: #ff9800;
    }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 16px;
      display: flex;
      justify-content: center;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      width: 100%;
      max-width: 380px;
      padding: 18px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .header-title {
      font-size: 15px;
      font-weight: 600;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .badge-free {
      background: #1976d2;
      color: #ffffff;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
      text-decoration: none;
    }
    .badge-free:hover {
      background: var(--accent-hover);
    }
    .section {
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .section-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
    }
    .section-subtitle {
      font-size: 11px;
      color: var(--text-muted);
    }
    .percentage {
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 6px;
    }
    .progress-bar-bg {
      background: var(--progress-bg);
      border-radius: 4px;
      height: 6px;
      overflow: hidden;
      margin-bottom: 6px;
    }
    .progress-bar-fill {
      background: var(--accent);
      height: 100%;
      border-radius: 4px;
      width: ${stats.percentDailyUsed}%;
      transition: width 0.3s ease;
    }
    .stat-detail {
      font-size: 11px;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
    }
    .checkbox-group {
      margin-top: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      cursor: pointer;
      color: var(--text);
    }
    .checkbox-label input {
      accent-color: var(--accent);
      cursor: pointer;
      width: 15px;
      height: 15px;
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 16px;
    }
    button {
      background: #2b2b2b;
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 7px 10px;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover {
      background: #383838;
      color: #ffffff;
    }
    .refresh-link {
      font-size: 11px;
      color: var(--accent);
      text-decoration: none;
      cursor: pointer;
      text-align: center;
      display: block;
      margin-top: 12px;
    }
    .refresh-link:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="header-title">
        <span>✨ GemComplete Free</span>
      </div>
      <a class="badge-free" onclick="sendMsg('openAiStudio')">Google AI Studio ↗</a>
    </div>

    <!-- Daily Request Limit (RPD) -->
    <div class="section">
      <div class="section-row">
        <span class="section-title">Daily Requests (RPD)</span>
        <span class="section-subtitle">Resets ${stats.resetTimeStr}</span>
      </div>
      <div class="percentage">${stats.percentDailyUsed}% <span style="font-size:12px; font-weight:normal; color:var(--text-muted);">used</span></div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill"></div>
      </div>
      <div class="stat-detail">
        <span>Used: <strong>${stats.requestsToday}</strong></span>
        <span>Remaining: <strong>${stats.remainingDailyRequests}</strong> / ${stats.maxDailyRequests}</span>
      </div>
    </div>

    <!-- Rate Limit & Cache (RPM) -->
    <div class="section">
      <div class="section-row">
        <span class="section-title">Speed & Live Rate Limit</span>
        <span class="section-subtitle" style="color:var(--success);">● Active</span>
      </div>
      <div class="stat-detail" style="margin-bottom:6px;">
        <span>Current Minute: <strong>${stats.requestsThisMinute}</strong> / ${stats.maxRpm} RPM</span>
        <span>Tokens Today: <strong>${stats.tokensToday.toLocaleString()}</strong></span>
      </div>
      <div class="stat-detail">
        <span>In-Memory Cache Hits: <strong>${stats.cacheHitsToday}</strong></span>
        <span>Quota Preserved: <strong>${stats.cacheSavingsPercent}%</strong></span>
      </div>
    </div>

    <!-- Inline Suggestions Toggles (Matching Copilot UI) -->
    <div class="section">
      <div class="section-row">
        <span class="section-title">Inline Suggestions</span>
        <span class="section-subtitle">${config.enabled ? 'Active' : 'Disabled'}</span>
      </div>
      <div class="checkbox-group">
        <label class="checkbox-label">
          <input type="checkbox" id="ghostToggle" ${config.enabled ? 'checked' : ''} onchange="sendMsg('toggleEnabled', this.checked)">
          <span>Ghost text suggestions</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" id="pythonToggle" ${!isPythonDisabled ? 'checked' : ''} onchange="sendMsg('togglePython', this.checked)">
          <span>Ghost text suggestions for Python</span>
        </label>
      </div>
    </div>

    <!-- Quick Action Buttons -->
    <div class="actions">
      <button onclick="sendMsg('setApiKey')">🔑 Set API Key</button>
      <button onclick="sendMsg('clearCache')">🗑️ Clear Cache</button>
      <button onclick="sendMsg('showLog')">📋 Output Log</button>
      <button onclick="sendMsg('openAiStudio')">🌐 Quota & Billing</button>
    </div>

    <a class="refresh-link" onclick="sendMsg('refresh')">↻ Refresh Live Stats</a>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function sendMsg(command, value) {
      vscode.postMessage({ command, value });
    }
  </script>
</body>
</html>`;
}
