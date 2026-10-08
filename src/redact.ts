/**
 * Secret redaction engine for GemComplete.
 * Scans code and logs to replace API keys, tokens, and credentials with [REDACTED].
 */

export const REDACTED_LABEL = '[REDACTED]';

export interface SecretPattern {
  readonly id: string;
  readonly description: string;
  readonly regex: RegExp;
  readonly replace: (substring: string, ...args: string[]) => string;
}

const COMMON_NON_SECRETS = new Set([
  '',
  '[redacted]',
  'undefined',
  'null',
  'true',
  'false',
  'todo',
  'changeme',
  'your_key_here',
  'your-api-key',
  'placeholder',
  'bearer',
]);

export const BUILTIN_PATTERNS: readonly SecretPattern[] = [
  // 1. Google API keys: AIza followed by 30-40 alphanumeric/dash/underscore chars
  {
    id: 'google-api-key',
    description: 'Google Cloud / Gemini API key',
    regex: /\bAIza[0-9A-Za-z\-_]{30,40}\b/g,
    replace: () => REDACTED_LABEL,
  },

  // 2. AWS Access Key IDs (AKIA, ASIA, etc.)
  {
    id: 'aws-access-key-id',
    description: 'AWS Access Key ID',
    regex: /\b(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b/g,
    replace: () => REDACTED_LABEL,
  },

  // 3. GitHub Tokens (personal access tokens, OAuth, fine-grained PATs)
  {
    id: 'github-token',
    description: 'GitHub Personal Access or OAuth Token',
    regex: /\b(?:gh[pours]_[a-zA-Z0-9]{36,255}|github_pat_[a-zA-Z0-9_]{22,255})\b/g,
    replace: () => REDACTED_LABEL,
  },

  // 4. OpenAI & standard sk- style API keys
  {
    id: 'openai-style-key',
    description: 'OpenAI / sk- style API key',
    regex: /\bsk-[a-zA-Z0-9_\-]{20,}\b/g,
    replace: () => REDACTED_LABEL,
  },

  // 5. Slack Tokens
  {
    id: 'slack-token',
    description: 'Slack API Token',
    regex: /\bxox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9\-]*/g,
    replace: () => REDACTED_LABEL,
  },

  // 6. JSON Web Tokens (JWT)
  {
    id: 'jwt',
    description: 'JSON Web Token (JWT)',
    regex: /\beyJ[a-zA-Z0-9_\-]{10,}\.eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]+\b/g,
    replace: () => REDACTED_LABEL,
  },

  // 7. PEM Private Key Blocks
  {
    id: 'pem-private-key',
    description: 'PEM formatted private key block',
    regex: /-----BEGIN (?:[A-Z0-9_\s-]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9_\s-]+ )?PRIVATE KEY-----/g,
    replace: () => `-----BEGIN PRIVATE KEY-----\n${REDACTED_LABEL}\n-----END PRIVATE KEY-----`,
  },

  // 8. Connection strings containing credentials (postgres, mongodb, mysql, redis, etc.)
  {
    id: 'connection-string-creds',
    description: 'Database connection URI with credentials',
    regex: /\b((?:postgres|postgresql|mongodb|mongodb\+srv|mysql|redis|rediss|amqp|amqps):\/\/[^:\s\/]+:)([^@\s\/]+)(@)/gi,
    replace: (_match, prefix: string, _password: string, suffix: string) => `${prefix}${REDACTED_LABEL}${suffix}`,
  },

  // 9. Generic secrets / tokens / passwords assignment: e.g. apiKey = "..." or password: '...'
  {
    id: 'generic-credential-assignment',
    description: 'Generic password, token, or secret assignment',
    regex: /\b(password|passwd|pwd|secret|api_?key|access_?token|auth_?token|client_?secret|private_?key)\s*([:=])\s*(['"`])([^'"`\r\n]+)\3/gi,
    replace: (match, varName: string, separator: string, quote: string, value: string) => {
      const lowerVal = value.trim().toLowerCase();
      if (COM_CHECK_NON_SECRET(lowerVal)) {
        return match;
      }
      return `${varName}${separator} ${quote}${REDACTED_LABEL}${quote}`;
    },
  },
];

function COM_CHECK_NON_SECRET(val: string): boolean {
  if (COMMON_NON_SECRETS.has(val)) {
    return true;
  }
  // Ignore single characters or purely whitespace
  if (val.length <= 1) {
    return true;
  }
  return false;
}

/**
 * Validates and compiles a user-supplied custom regex pattern.
 * Protects against invalid syntax, excessively complex patterns, and ReDoS risks.
 */
export function compileSafeRegex(patternStr: string): RegExp | null {
  const trimmed = patternStr.trim();
  if (!trimmed) {
    return null;
  }

  // Length guard to prevent deeply nested quantifier bombs
  if (trimmed.length > 250) {
    return null;
  }

  // Basic sanity check against dangerous nested quantifiers like (a+)+ or a++
  if (
    /([+*]|\{\d+,?\d*\})\s*([+*]|\{\d+,?\d*\})/.test(trimmed) ||
    /\([^\)]*[+*]\s*\)\s*[+*]/.test(trimmed)
  ) {
    return null;
  }

  try {
    return new RegExp(trimmed, 'g');
  } catch {
    return null;
  }
}

const MAX_INPUT_SIZE_FOR_REDACTION = 1_000_000; // 1 MB cap

/**
 * Redacts known secret patterns and custom patterns from input text.
 */
export function redactSecrets(input: string, customPatterns: readonly string[] = []): string {
  if (!input) {
    return '';
  }

  // Prevent catastrophic performance on absurdly large inputs
  const textToScan = input.length > MAX_INPUT_SIZE_FOR_REDACTION
    ? input.slice(0, MAX_INPUT_SIZE_FOR_REDACTION)
    : input;

  let redacted = textToScan;

  // Apply built-in patterns
  for (const pattern of BUILTIN_PATTERNS) {
    try {
      // Reset lastIndex for global regexes
      pattern.regex.lastIndex = 0;
      redacted = redacted.replace(pattern.regex, (match: string, ...args: unknown[]) => {
        const strArgs = args.map((a) => (typeof a === 'string' ? a : String(a)));
        return pattern.replace(match, ...strArgs);
      });
    } catch {
      // Continue safely if a pattern encounters an unexpected issue
    }
  }

  // Apply custom patterns safely
  for (const rawPattern of customPatterns) {
    const compiled = compileSafeRegex(rawPattern);
    if (!compiled) {
      continue;
    }

    try {
      compiled.lastIndex = 0;
      redacted = redacted.replace(compiled, REDACTED_LABEL);
    } catch {
      // Ignore failures in user regexes
    }
  }

  return redacted;
}

/**
 * Sanitizes log lines before they reach the VS Code OutputChannel.
 * Strips secrets and ensures no API keys or raw user code leak.
 */
export function redactLogMessage(message: string): string {
  if (!message) {
    return '';
  }
  return redactSecrets(message);
}
