# Security Policy

The GemComplete team is committed to ensuring the highest standards of security and privacy for developers. Because code completions transmit context to Google's Gemini API, we implement strict defenses by default and prioritize rapid resolution of any reported vulnerabilities.

## Supported Versions

Only the latest release of GemComplete receives security updates and patches.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Security Principles of GemComplete

1. **Credentials Isolation**: Your Gemini API key is stored exclusively inside VS Code's encrypted `SecretStorage` system service (such as Windows Credential Manager, macOS Keychain, or Linux Secret Service via GNOME Keyring). It is never stored in workspace settings, local files, global state, or debug logs.
2. **Strict In-Flight Redaction**: Before any code prefix or suffix is sent across the wire, a multi-layer regex redaction engine scrubs known secret formats (AWS keys, GitHub tokens, JWTs, PEM private keys, database connection strings, generic password assignments).
3. **Transport Security**: All API traffic strictly uses HTTPS to `generativelanguage.googleapis.com`. The API key is sent via the `x-goog-api-key` header to prevent leaking into proxy logs or query URLs.
4. **File Scope Isolation**: Files matching sensitive glob patterns (e.g. `.env*`, `*.pem`, `id_rsa*`, `.git/config`) are skipped and never read or transmitted.
5. **No Persistent Disk Caching**: Cached completions are kept strictly in-memory (RAM) with an LRU limit and TTL, purged upon deactivation or via the `Clear Cache` command.
6. **Zero Telemetry**: GemComplete contains no usage tracking, analytics, or third-party tracking services.

## Reporting a Vulnerability

If you discover a security vulnerability in GemComplete, please **do not open a public issue**. Instead, follow responsible disclosure:

1. **Email**: Send a detailed report to `security@gemcomplete.local` (or file a private GitHub Security Advisory).
2. **Include in Report**:
   - Description of the vulnerability and its potential impact
   - Minimal steps or sample project to reproduce the issue
   - Your name and affiliation for recognition (optional)
3. **Response Timeline**:
   - **Acknowledgement**: Within 24-48 hours.
   - **Assessment & Fix**: Vulnerability confirmation and remediation target within 7 business days.
   - **Release**: Coordinated disclosure once a patch is released to the VS Code Marketplace.
