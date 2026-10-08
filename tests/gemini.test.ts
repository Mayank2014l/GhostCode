import * as assert from 'assert';
import { deduplicateSuffix, postProcessCompletion } from '../src/gemini';

suite('Gemini Client & Post-Processing Test Suite', () => {
  test('1. Strips markdown fences with language identifier', () => {
    const raw = '```typescript\nconst message = "hello world";\n```';
    const processed = postProcessCompletion(raw, '');
    assert.strictEqual(processed, 'const message = "hello world";');
  });

  test('2. Strips plain markdown fences without language identifier', () => {
    const raw = '```\nreturn a + b;\n```';
    const processed = postProcessCompletion(raw, '');
    assert.strictEqual(processed, 'return a + b;');
  });

  test('3. Deduplicates closing parentheses and semicolons', () => {
    // Suffix already has `);`
    const suffix = ');';
    const raw = 'calculateTotal(item1, item2);';
    const processed = postProcessCompletion(raw, suffix);
    assert.strictEqual(processed, 'calculateTotal(item1, item2');
  });

  test('4. Deduplicates closing braces and newlines', () => {
    const suffix = '\n}';
    const raw = '  console.log("inside block");\n}';
    const processed = postProcessCompletion(raw, suffix);
    assert.strictEqual(processed, '  console.log("inside block");');
  });

  test('5. Handles partial overlap correctly in deduplicateSuffix', () => {
    const completion = 'response.setHeader("Content-Type", "application/json");';
    const suffix = '");';
    const deduped = deduplicateSuffix(completion, suffix);
    assert.strictEqual(deduped, 'response.setHeader("Content-Type", "application/json');
  });

  test('6. Does not alter completion when there is no suffix overlap', () => {
    const completion = 'const x = 100;';
    const suffix = '\nfunction next() {}';
    const deduped = deduplicateSuffix(completion, suffix);
    assert.strictEqual(deduped, completion);
  });

  test('7. Trims trailing whitespace while preserving intended content', () => {
    const raw = 'const name = "Alice";    \t  ';
    const processed = postProcessCompletion(raw, '');
    assert.strictEqual(processed, 'const name = "Alice";');
  });
});
