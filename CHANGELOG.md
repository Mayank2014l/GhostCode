# Changelog

All notable changes to the "GemComplete" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-02

### Added
- **Core Inline Completion Engine**: Copilot-style multi-line ghost-text suggestions powered by Google Gemini REST API.
- **Universal Language Support**: Registered for all languages (`{ pattern: '**' }`).
- **Fill-in-the-Middle Context Builder**: Intelligent extraction of prefix and suffix context with configurable char bounds.
- **Smart Rate-Limit Management**:
  - Configurable debounce delay (default 600ms).
  - Keystroke cancellation using `AbortController`.
  - In-memory SHA-256 LRU cache with TTL expiration.
  - Heuristic skip rules: empty files, lines after closing braces, mid-word typing with < 2 characters, and file size limits.
  - Graceful exponential backoff on HTTP 429 and automatic fallback model switching (`gemini-2.0-flash`, `gemini-1.5-flash`).
- **Comprehensive Security & Privacy Architecture**:
  - Secure credential storage solely in VS Code `SecretStorage`.
  - HTTP `x-goog-api-key` header transport (never in query URLs).
  - Multi-pattern real-time secret redaction engine (Google keys, AWS, GitHub PATs, OpenAI/sk-, Slack tokens, JWTs, PEM blocks, connection strings, generic assignments).
  - Custom regex redaction with ReDoS and length guards.
  - Workspace Trust enforcement (`untrustedWorkspaces.supported = false`).
  - Sensitive file exclusion globs (`.env*`, `.pem`, `.key`, `id_rsa*`, `.git/config`, etc.).
  - One-click Private Mode (zero network activity).
  - First-run explicit user consent prompt.
  - Prompt-injection defense system instruction.
  - Zero telemetry, zero analytics, zero disk logging.
- **Status Bar Integration**: Visual indicator showing idle, generating, rate-limited backoff, private mode, and disabled states.
- **Commands**:
  - `GemComplete: Toggle On/Off`
  - `GemComplete: Toggle Private Mode`
  - `GemComplete: Set API Key`
  - `GemComplete: Clear API Key`
  - `GemComplete: Clear Cache`
  - `GemComplete: Show Output Log`
