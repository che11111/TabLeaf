import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatSearchMatchCount,
  normalizeLocale,
  setLanguage,
  t
} from '../lib/i18n.js';

test('normalizes browser locale names to extension locale folders', () => {
  assert.equal(normalizeLocale('zh-CN'), 'zh_CN');
  assert.equal(normalizeLocale('zh-TW'), 'zh_TW');
  assert.equal(normalizeLocale('de-DE'), 'de');
  assert.equal(normalizeLocale('fr'), 'fr');
  assert.equal(normalizeLocale('unknown'), null);
});

test('interpolates translation values', () => {
  globalThis.chrome = {
    i18n: {
      getMessage(key) {
        return key === 'message' ? 'Nothing matches “{query}”.' : '';
      }
    }
  };

  assert.equal(
    t('message', { query: 'test' }),
    'Nothing matches “test”.'
  );

  delete globalThis.chrome;
});

test('uses Intl plural rules for search result counts', async () => {
  const messages = {
    searchMatch_one: '{count} совпадение',
    searchMatch_few: '{count} совпадения',
    searchMatch_many: '{count} совпадений',
    searchMatch_other: '{count} совпадения'
  };

  globalThis.chrome = {
    i18n: {
      getMessage(key) {
        return messages[key] ?? '';
      },
      getUILanguage() {
        return 'ru';
      }
    }
  };

  await setLanguage('ru');
  assert.equal(formatSearchMatchCount(1), '1 совпадение');
  assert.equal(formatSearchMatchCount(3), '3 совпадения');
  assert.equal(formatSearchMatchCount(5), '5 совпадений');

  await setLanguage('en');
  delete globalThis.chrome;
});
