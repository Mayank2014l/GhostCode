import * as assert from 'assert';
import { globToRegExp, matchesExcludeGlob } from '../src/context';

suite('Context & Glob Exclusions Test Suite', () => {
  const defaultExcludes = [
    '**/.env*',
    '**/*.pem',
    '**/*.key',
    '**/id_rsa*',
    '**/*.p12',
    '**/secrets.*',
    '**/credentials.*',
    '**/.npmrc',
    '**/.git/config',
  ];

  test('1. Matches sensitive environment files', () => {
    assert.strictEqual(matchesExcludeGlob('.env', defaultExcludes), true);
    assert.strictEqual(matchesExcludeGlob('.env.local', defaultExcludes), true);
    assert.strictEqual(matchesExcludeGlob('backend/.env.production', defaultExcludes), true);
    assert.strictEqual(matchesExcludeGlob('src/environment.ts', defaultExcludes), false);
  });

  test('2. Matches private keys and certificates', () => {
    assert.strictEqual(matchesExcludeGlob('server.pem', defaultExcludes), true);
    assert.strictEqual(matchesExcludeGlob('certs/production.key', defaultExcludes), true);
    assert.strictEqual(matchesExcludeGlob('ssh/id_rsa', defaultExcludes), true);
    assert.strictEqual(matchesExcludeGlob('ssh/id_rsa.pub', defaultExcludes), true);
    assert.strictEqual(matchesExcludeGlob('auth/cert.p12', defaultExcludes), true);
    assert.strictEqual(matchesExcludeGlob('src/keysHandler.ts', defaultExcludes), false);
  });

  test('3. Matches secret configs and git configuration', () => {
    assert.strictEqual(matchesExcludeGlob('config/secrets.json', defaultExcludes), true);
    assert.strictEqual(matchesExcludeGlob('credentials.yaml', defaultExcludes), true);
    assert.strictEqual(matchesExcludeGlob('.npmrc', defaultExcludes), true);
    assert.strictEqual(matchesExcludeGlob('.git/config', defaultExcludes), true);
    assert.strictEqual(matchesExcludeGlob('src/secretsService.ts', defaultExcludes), false);
  });

  test('4. Glob regex conversion handles edge characters', () => {
    const regex = globToRegExp('**/*.test.ts');
    assert.ok(regex.test('src/unit.test.ts'));
    assert.ok(regex.test('tests/cache.test.ts'));
    assert.ok(!regex.test('src/unit.ts'));
  });
});
