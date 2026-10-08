import * as assert from 'assert';
import {
  BUILTIN_PATTERNS,
  compileSafeRegex,
  REDACTED_LABEL,
  redactLogMessage,
  redactSecrets,
} from '../src/redact';

suite('Redaction Engine Test Suite', () => {
  test('0. Built-in pattern registry contains all required secret signatures', () => {
    assert.ok(BUILTIN_PATTERNS.length >= 9);
    const ids = BUILTIN_PATTERNS.map((p) => p.id);
    assert.ok(ids.includes('google-api-key'));
    assert.ok(ids.includes('aws-access-key-id'));
    assert.ok(ids.includes('github-token'));
    assert.ok(ids.includes('openai-style-key'));
    assert.ok(ids.includes('slack-token'));
    assert.ok(ids.includes('jwt'));
    assert.ok(ids.includes('pem-private-key'));
    assert.ok(ids.includes('connection-string-creds'));
    assert.ok(ids.includes('generic-credential-assignment'));
  });

  test('1. Redacts Google / Gemini API keys', () => {
    const mockKey = ['AIza', 'SyD-x92KLmj0123456789abcdef0123456'].join('');
    const input = `const geminiKey = "${mockKey}";`;
    const result = redactSecrets(input);
    assert.ok(!result.includes('AIzaSyD'));
    assert.ok(result.includes(REDACTED_LABEL));
  });

  test('2. Redacts AWS Access Key IDs', () => {
    const mockAws = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
    const input = `export AWS_ACCESS_KEY_ID="${mockAws}"`;
    const result = redactSecrets(input);
    assert.ok(!result.includes(mockAws));
    assert.ok(result.includes(REDACTED_LABEL));

    const mockTempAws = ['ASIA', 'IOSFODNN7EXAMPLE'].join('');
    const tempAws = `export AWS_SESSION_KEY="${mockTempAws}"`;
    const tempResult = redactSecrets(tempAws);
    assert.ok(!tempResult.includes(mockTempAws));
    assert.ok(tempResult.includes(REDACTED_LABEL));
  });

  test('3. Redacts GitHub Personal Access Tokens and fine-grained tokens', () => {
    const mockPat = ['ghp_', '1234567890abcdefghijklmnopqrstuvwxyz'].join('');
    const classicPat = `git config github.token ${mockPat}`;
    assert.ok(!redactSecrets(classicPat).includes('ghp_'));
    assert.ok(redactSecrets(classicPat).includes(REDACTED_LABEL));

    const mockFine = ['github_pat_', '11ABCD1234567890abcdef_1234567890abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuv'].join('');
    const fineGrained = `const pat = "${mockFine}";`;
    assert.ok(!redactSecrets(fineGrained).includes('github_pat_'));
    assert.ok(redactSecrets(fineGrained).includes(REDACTED_LABEL));
  });

  test('4. Redacts OpenAI / sk- style API keys', () => {
    const mockSk = ['sk-', 'abc1234567890abcdefghijklmnopqrstuvwxyz'].join('');
    const input = `const openAiKey = "${mockSk}";`;
    const result = redactSecrets(input);
    assert.ok(!result.includes('sk-abc1234567890'));
    assert.ok(result.includes(REDACTED_LABEL));
  });

  test('5. Redacts Slack tokens', () => {
    const mockSlack = ['xo', 'xb-', '123456789012-', '1234567890123-', 'abcdefghijklmnopqrstuv'].join('');
    const input = `const slack = "${mockSlack}";`;
    const result = redactSecrets(input);
    assert.ok(!result.includes('xoxb-'));
    assert.ok(result.includes(REDACTED_LABEL));
  });

  test('6. Redacts JSON Web Tokens (JWT)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const input = `const authHeader = "Bearer ${jwt}";`;
    const result = redactSecrets(input);
    assert.ok(!result.includes('eyJhbGciOiJIUzI1Ni'));
    assert.ok(result.includes(REDACTED_LABEL));
  });

  test('7. Redacts PEM private key blocks', () => {
    const pem = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y1+abcdefghijklmnopqrstuvwxyz
1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ==
-----END RSA PRIVATE KEY-----`;
    const result = redactSecrets(pem);
    assert.ok(!result.includes('MIIEowIBAAKCAQEA0Y1'));
    assert.ok(result.includes(REDACTED_LABEL));
    assert.ok(result.includes('-----BEGIN PRIVATE KEY-----'));
  });

  test('8. Redacts credentials in connection strings', () => {
    const postgres = 'const dbUrl = "postgres://admin:SuperSecretPass123!@db.internal.net:5432/production";';
    const pgResult = redactSecrets(postgres);
    assert.ok(!pgResult.includes('SuperSecretPass123!'));
    assert.ok(pgResult.includes('postgres://admin:[REDACTED]@db.internal.net'));

    const mongo = 'mongodb+srv://root:MyClusterPass@cluster0.abc.mongodb.net/test';
    const mongoResult = redactSecrets(mongo);
    assert.ok(!mongoResult.includes('MyClusterPass'));
    assert.ok(mongoResult.includes('mongodb+srv://root:[REDACTED]@cluster0'));
  });

  test('9. Redacts generic credential assignments', () => {
    const input = 'const password = "SuperSecretPlainTextPassword";';
    const result = redactSecrets(input);
    assert.ok(!result.includes('SuperSecretPlainTextPassword'));
    assert.ok(result.includes(REDACTED_LABEL));

    const yamlInput = 'client_secret: "987654321_topsecret"';
    const yamlResult = redactSecrets(yamlInput);
    assert.ok(!yamlResult.includes('987654321_topsecret'));
    assert.ok(yamlResult.includes(REDACTED_LABEL));
  });

  test('10. Supports user-defined custom redaction patterns', () => {
    const customPattern = 'ACME-[0-9]{5}-[A-Z]{3}';
    const input = 'const internalCode = "ACME-99123-XYZ";';
    const result = redactSecrets(input, [customPattern]);
    assert.ok(!result.includes('ACME-99123-XYZ'));
    assert.ok(result.includes(REDACTED_LABEL));
  });

  test('11. ReDoS protection & invalid regex validation', () => {
    // Dangerous nested quantifiers must be rejected
    const dangerous = '(a+)+';
    assert.strictEqual(compileSafeRegex(dangerous), null);

    // Overly long pattern rejected
    const longPattern = 'a'.repeat(300);
    assert.strictEqual(compileSafeRegex(longPattern), null);

    // Invalid regex syntax safely rejected
    const invalidSyntax = '[a-z(';
    assert.strictEqual(compileSafeRegex(invalidSyntax), null);
  });

  test('12. False-Positive Checks (Does not corrupt normal code)', () => {
    // Normal variable declarations without secrets
    const code1 = 'function verifyPassword(password: string): boolean { return false; }';
    assert.strictEqual(redactSecrets(code1), code1);

    // Common non-secret placeholders
    const code2 = 'const apiKey = "your_key_here";';
    assert.strictEqual(redactSecrets(code2), code2);

    const code3 = 'const secret = "";';
    assert.strictEqual(redactSecrets(code3), code3);

    const code4 = 'const password = "[REDACTED]";';
    assert.strictEqual(redactSecrets(code4), code4);

    // Token types and normal identifiers
    const code5 = 'const tokenType = "Bearer";';
    assert.strictEqual(redactSecrets(code5), code5);
  });

  test('13. Redacts log messages', () => {
    const log = 'API call dispatched with key AIzaSyA1234567890123456789012345678901';
    const sanitized = redactLogMessage(log);
    assert.ok(!sanitized.includes('AIzaSyA'));
    assert.ok(sanitized.includes(REDACTED_LABEL));
  });
});
