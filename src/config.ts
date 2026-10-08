import * as vscode from 'vscode';

export interface GemCompleteConfig {
  readonly enabled: boolean;
  readonly model: string;
  readonly fallbackModels: readonly string[];
  readonly debounceMs: number;
  readonly maxPrefixChars: number;
  readonly maxSuffixChars: number;
  readonly maxOutputTokens: number;
  readonly temperature: number;
  readonly disabledLanguages: readonly string[];
  readonly excludeGlobs: readonly string[];
  readonly customRedactionPatterns: readonly string[];
  readonly privateMode: boolean;
  readonly includeOtherOpenTabs: boolean;
  readonly maxFileSizeKB: number;
  readonly apiEndpoint: string;
}

const DEFAULT_CONFIG: GemCompleteConfig = {
  enabled: true,
  model: 'gemini-3.1-flash-lite',
  fallbackModels: ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.5-flash'],
  debounceMs: 150,
  maxPrefixChars: 3000,
  maxSuffixChars: 1000,
  maxOutputTokens: 128,
  temperature: 0.2,
  disabledLanguages: ['plaintext', 'markdown', 'scminput'],
  excludeGlobs: [
    '**/.env*',
    '**/*.pem',
    '**/*.key',
    '**/id_rsa*',
    '**/*.p12',
    '**/secrets.*',
    '**/credentials.*',
    '**/.npmrc',
    '**/.git/config',
  ],
  customRedactionPatterns: [],
  privateMode: false,
  includeOtherOpenTabs: false,
  maxFileSizeKB: 1000,
  apiEndpoint: 'https://generativelanguage.googleapis.com',
};

const ALLOWED_DEFAULT_HOST = 'generativelanguage.googleapis.com';

/**
 * Validates that an API endpoint is secure:
 * 1. Must use HTTPS
 * 2. If pointing to Google, must match official host
 * 3. Strips trailing slashes
 */
export function validateApiEndpoint(rawEndpoint: string): { valid: boolean; normalized: string; warning?: string } {
  const trimmed = rawEndpoint.trim();
  if (!trimmed) {
    return { valid: true, normalized: DEFAULT_CONFIG.apiEndpoint };
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') {
      return {
        valid: false,
        normalized: DEFAULT_CONFIG.apiEndpoint,
        warning: `Insecure API endpoint protocol "${url.protocol}". GemComplete mandates HTTPS for data confidentiality. Reverting to default.`,
      };
    }

    if (url.hostname.endsWith('googleapis.com') && url.hostname !== ALLOWED_DEFAULT_HOST) {
      return {
        valid: false,
        normalized: DEFAULT_CONFIG.apiEndpoint,
        warning: `Disallowed googleapis host "${url.hostname}". Endpoint must be https://${ALLOWED_DEFAULT_HOST}. Reverting to default.`,
      };
    }

    // Normalized without trailing slash
    const normalized = `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
    return { valid: true, normalized };
  } catch {
    return {
      valid: false,
      normalized: DEFAULT_CONFIG.apiEndpoint,
      warning: `Malformed API endpoint "${rawEndpoint}". Reverting to default.`,
    };
  }
}

/**
 * Read the current configuration from VS Code workspace settings.
 */
export function getExtensionConfig(): GemCompleteConfig {
  const wsConfig = vscode.workspace.getConfiguration('gemcomplete');

  const rawEndpoint = wsConfig.get<string>('apiEndpoint', DEFAULT_CONFIG.apiEndpoint);
  const endpointValidation = validateApiEndpoint(rawEndpoint);
  if (endpointValidation.warning) {
    vscode.window.showWarningMessage(`[GemComplete] ${endpointValidation.warning}`);
  }

  return {
    enabled: wsConfig.get<boolean>('enabled', DEFAULT_CONFIG.enabled),
    model: wsConfig.get<string>('model', DEFAULT_CONFIG.model).trim() || DEFAULT_CONFIG.model,
    fallbackModels: wsConfig.get<string[]>('fallbackModels', [...DEFAULT_CONFIG.fallbackModels]),
    debounceMs: Math.max(100, wsConfig.get<number>('debounceMs', DEFAULT_CONFIG.debounceMs)),
    maxPrefixChars: Math.max(200, wsConfig.get<number>('maxPrefixChars', DEFAULT_CONFIG.maxPrefixChars)),
    maxSuffixChars: Math.max(100, wsConfig.get<number>('maxSuffixChars', DEFAULT_CONFIG.maxSuffixChars)),
    maxOutputTokens: Math.max(16, Math.min(2048, wsConfig.get<number>('maxOutputTokens', DEFAULT_CONFIG.maxOutputTokens))),
    temperature: Math.max(0, Math.min(1.0, wsConfig.get<number>('temperature', DEFAULT_CONFIG.temperature))),
    disabledLanguages: wsConfig.get<string[]>('disabledLanguages', [...DEFAULT_CONFIG.disabledLanguages]),
    excludeGlobs: wsConfig.get<string[]>('excludeGlobs', [...DEFAULT_CONFIG.excludeGlobs]),
    customRedactionPatterns: wsConfig.get<string[]>('customRedactionPatterns', [...DEFAULT_CONFIG.customRedactionPatterns]),
    privateMode: wsConfig.get<boolean>('privateMode', DEFAULT_CONFIG.privateMode),
    includeOtherOpenTabs: wsConfig.get<boolean>('includeOtherOpenTabs', DEFAULT_CONFIG.includeOtherOpenTabs),
    maxFileSizeKB: Math.max(10, wsConfig.get<number>('maxFileSizeKB', DEFAULT_CONFIG.maxFileSizeKB)),
    apiEndpoint: endpointValidation.normalized,
  };
}

/**
 * Helper to update configuration dynamically.
 */
export async function updateExtensionConfig<T>(key: string, value: T, target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global): Promise<void> {
  const wsConfig = vscode.workspace.getConfiguration('gemcomplete');
  await wsConfig.update(key, value, target);
}
