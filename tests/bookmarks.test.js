import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSearchIndex,
  findSearchRanges,
  flattenBookmarks,
  getDirectFaviconUrl,
  normalizeSearchText,
  normalizeBookmarkTree,
  searchBookmarks
} from '../extension/lib/bookmarks.js';

test('normalizes Chrome root nodes and nested folders', () => {
  const tree = normalizeBookmarkTree([{
    id: '0',
    title: '',
    children: [{
      id: '1',
      title: 'Bookmarks bar',
      children: [{
        id: '2',
        title: 'Example',
        url: 'https://example.com/'
      }]
    }]
  }]);

  assert.equal(tree.length, 1);
  assert.equal(tree[0].title, 'Bookmarks bar');
  assert.equal(tree[0].children[0].url, 'https://example.com/');
});

test('blocks executable URLs while retaining a safe title', () => {
  const tree = normalizeBookmarkTree([{
    title: 'Unsafe',
    url: 'javascript:alert(document.domain)'
  }]);

  assert.equal(tree[0].url, '');
  assert.equal(tree[0].invalidUrl, true);
  assert.equal(tree[0].title, 'Unsafe');
});

test('searches literal special characters without using regular expressions', () => {
  const tree = normalizeBookmarkTree([{
    title: 'Bookmarks bar',
    children: [
      { title: 'Function (beta)', url: 'https://example.com/a' },
      { title: 'Array [docs]', url: 'https://example.com/b' }
    ]
  }]);

  assert.equal(searchBookmarks(tree, '(').length, 1);
  assert.equal(searchBookmarks(tree, '[').length, 1);
  assert.equal(searchBookmarks(tree, '.*').length, 0);
});

test('searches and highlights Unicode text with case and accent folding', () => {
  const tree = normalizeBookmarkTree([{
    title: 'Bookmarks bar',
    children: [
      { title: 'İstanbul Straße', url: 'https://example.com/istanbul' }
    ]
  }]);

  assert.equal(normalizeSearchText('Straße'), 'strasse');
  assert.equal(searchBookmarks(tree, 'istanbul').length, 1);
  assert.equal(searchBookmarks(tree, 'STRASSE').length, 1);
  assert.deepEqual(
    findSearchRanges('İstanbul Straße', 'istanbul'),
    [{ start: 0, end: 8 }]
  );
  assert.deepEqual(
    findSearchRanges('İstanbul Straße', 'strasse'),
    [{ start: 9, end: 15 }]
  );
});

test('builds a reusable search index with folder paths', () => {
  const tree = normalizeBookmarkTree([{
    title: 'Root',
    children: [{ title: 'Leaf', url: 'https://example.com/' }]
  }]);
  const index = buildSearchIndex(tree);
  const results = searchBookmarks(tree, 'leaf', index);

  assert.equal(results.length, 1);
  assert.deepEqual(results[0].path, ['Root']);
});

test('drops browser separator nodes', () => {
  const tree = normalizeBookmarkTree([{
    title: 'Root',
    children: [
      { type: 'separator', title: '' },
      { title: 'Leaf', url: 'https://example.com/' }
    ]
  }]);

  assert.equal(tree[0].children.length, 1);
  assert.equal(tree[0].children[0].title, 'Leaf');
});

test('drops objects that are neither folders nor bookmarks', () => {
  assert.deepEqual(
    normalizeBookmarkTree([{ title: 'Unknown', foo: 1 }]),
    []
  );
});

test('flattens bookmarks with their folder path', () => {
  const tree = normalizeBookmarkTree([{
    title: 'Root',
    children: [{
      title: 'Nested',
      children: [{ title: 'Leaf', url: 'https://example.com/' }]
    }]
  }]);

  const flattened = flattenBookmarks(tree);
  assert.deepEqual(flattened[0].path, ['Root', 'Nested']);
  assert.equal(flattened[0].bookmark.title, 'Leaf');
});

test('derives a direct favicon URL only for HTTP bookmarks', () => {
  assert.equal(
    getDirectFaviconUrl({ url: 'https://example.com/docs/page' }),
    'https://example.com/favicon.ico'
  );
  assert.equal(
    getDirectFaviconUrl({ url: 'chrome://bookmarks/' }),
    ''
  );
});
