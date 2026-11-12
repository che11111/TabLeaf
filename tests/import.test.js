import test from 'node:test';
import assert from 'node:assert/strict';

import { parseBookmarkFile } from '../extension/lib/import.js';

test('rejects JSON objects without bookmark structure', () => {
  assert.throws(
    () => parseBookmarkFile('{}', 'bookmarks.json'),
    /importNotFound/
  );
  assert.throws(
    () => parseBookmarkFile('[{"foo":1}]', 'bookmarks.json'),
    /importNotFound/
  );
});

test('rejects JSON containing only blocked URLs', () => {
  assert.throws(
    () => parseBookmarkFile(
      '[{"title":"Unsafe","url":"javascript:alert(1)"}]',
      'bookmarks.json'
    ),
    /importNotFound/
  );
});

test('imports valid JSON and ignores separators', () => {
  const bookmarks = parseBookmarkFile(JSON.stringify([{
    title: 'Root',
    children: [
      { type: 'separator', title: '' },
      { title: 'Example', url: 'https://example.com/' }
    ]
  }]), 'bookmarks.json');

  assert.equal(bookmarks.length, 1);
  assert.equal(bookmarks[0].children.length, 1);
  assert.equal(bookmarks[0].children[0].title, 'Example');
});
