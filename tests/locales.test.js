import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const locales = [
  'en',
  'zh_CN',
  'zh_TW',
  'ja',
  'ko',
  'de',
  'fr',
  'es',
  'ru'
];

function loadMessages(locale) {
  const path = join(root, '_locales', locale, 'messages.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('all locales contain the same translation keys', () => {
  const expectedKeys = Object.keys(loadMessages('en')).sort();

  for (const locale of locales) {
    const messages = loadMessages(locale);
    assert.deepEqual(
      Object.keys(messages).sort(),
      expectedKeys,
      `${locale} has missing or extra translation keys`
    );

    for (const [key, value] of Object.entries(messages)) {
      assert.equal(
        typeof value.message,
        'string',
        `${locale}.${key} must contain a message string`
      );
      assert.ok(
        value.message.trim().length > 0,
        `${locale}.${key} must not be empty`
      );
    }
  }
});

test('manifest default locale is present', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  assert.ok(locales.includes(manifest.default_locale));
});
