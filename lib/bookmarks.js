const BLOCKED_PROTOCOLS = new Set(['javascript:', 'data:', 'vbscript:']);

function normalizeTitle(rawTitle, fallback) {
  const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  return title || fallback;
}

export function normalizeSearchText(rawValue) {
  return String(rawValue ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/ß/g, 'ss');
}

export function findSearchRanges(rawText, rawQuery) {
  const text = String(rawText ?? '');
  const query = normalizeSearchText(rawQuery).trim();
  if (!query) {
    return [];
  }

  let normalizedText = '';
  const originalStarts = [];
  const originalEnds = [];
  let originalOffset = 0;

  for (const character of text) {
    const normalizedCharacter = normalizeSearchText(character);
    const originalEnd = originalOffset + character.length;

    for (let index = 0; index < normalizedCharacter.length; index += 1) {
      originalStarts.push(originalOffset);
      originalEnds.push(originalEnd);
    }

    normalizedText += normalizedCharacter;
    originalOffset = originalEnd;
  }

  const ranges = [];
  let matchIndex = normalizedText.indexOf(query);

  while (matchIndex !== -1) {
    const matchEnd = matchIndex + query.length;
    ranges.push({
      start: originalStarts[matchIndex] ?? text.length,
      end: originalEnds[matchEnd - 1] ?? text.length
    });
    matchIndex = normalizedText.indexOf(query, matchEnd);
  }

  return ranges;
}

export function normalizeBookmarkUrl(rawUrl) {
  const value = typeof rawUrl === 'string' ? rawUrl.trim() : '';

  if (!value) {
    return { url: '', valid: false };
  }

  try {
    const parsed = new URL(value);
    if (BLOCKED_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
      return { url: '', valid: false };
    }
    return { url: parsed.href, valid: true };
  } catch {
    return { url: '', valid: false };
  }
}

function normalizeNode(rawNode, labels) {
  if (!rawNode || typeof rawNode !== 'object') {
    return null;
  }

  if (rawNode.type === 'separator') {
    return null;
  }

  const id = rawNode.id === undefined ? undefined : String(rawNode.id);

  if (Array.isArray(rawNode.children)) {
    const children = rawNode.children
      .map((child) => normalizeNode(child, labels))
      .filter(Boolean);

    return {
      ...(id === undefined ? {} : { id }),
      title: normalizeTitle(rawNode.title ?? rawNode.name, labels.untitledFolder),
      isFolder: true,
      children
    };
  }

  if (typeof rawNode.url !== 'string') {
    return null;
  }

  const normalizedUrl = normalizeBookmarkUrl(rawNode.url);
  const rawUrl = typeof rawNode.url === 'string' ? rawNode.url.trim() : '';
  const fallbackTitle = normalizedUrl.valid
    ? normalizedUrl.url
    : labels.untitledBookmark;

  return {
    ...(id === undefined ? {} : { id }),
    title: normalizeTitle(rawNode.title ?? rawNode.name, fallbackTitle),
    isFolder: false,
    url: normalizedUrl.url,
    invalidUrl: !normalizedUrl.valid,
    originalUrl: normalizedUrl.valid ? '' : rawUrl
  };
}

export function normalizeBookmarkTree(input, customLabels = {}) {
  const labels = {
    untitledFolder: 'Untitled folder',
    untitledBookmark: 'Untitled bookmark',
    ...customLabels
  };
  const roots = Array.isArray(input)
    ? input
    : input && typeof input === 'object'
      ? [input]
      : [];

  const normalized = roots
    .map((node) => normalizeNode(node, labels))
    .filter(Boolean);

  // Chrome returns a synthetic id=0 root. Its children are the visible roots.
  if (
    normalized.length === 1 &&
    normalized[0].isFolder &&
    (roots[0].id === '0' || !String(roots[0].title ?? '').trim())
  ) {
    return normalized[0].children;
  }

  return normalized;
}

export function flattenBookmarks(nodes, path = [], output = []) {
  for (const node of nodes) {
    if (node.isFolder) {
      flattenBookmarks(node.children, [...path, node.title], output);
    } else {
      output.push({ bookmark: node, path });
    }
  }

  return output;
}

export function hasValidBookmarks(nodes) {
  return flattenBookmarks(nodes).some(({ bookmark }) => !bookmark.invalidUrl);
}

export function buildSearchIndex(nodes) {
  return flattenBookmarks(nodes).map(({ bookmark, path }) => ({
    bookmark,
    path,
    titleSearch: normalizeSearchText(bookmark.title),
    urlSearch: normalizeSearchText(bookmark.url)
  }));
}

export function searchBookmarks(nodes, rawQuery, index = buildSearchIndex(nodes)) {
  const query = normalizeSearchText(rawQuery).trim();
  if (!query) {
    return [];
  }

  return index
    .filter((entry) => {
      return (
        entry.titleSearch.includes(query) ||
        entry.urlSearch.includes(query)
      );
    })
    .map(({ bookmark, path }) => ({ bookmark, path }));
}

export function getFaviconUrl(bookmark, size = 32) {
  if (!bookmark.url || bookmark.invalidUrl) {
    return '';
  }

  const api = globalThis.browser?.runtime?.getURL
    ? globalThis.browser
    : globalThis.chrome;

  if (!api?.runtime?.getURL) {
    return '';
  }

  const permissions = api.runtime.getManifest?.().permissions ?? [];
  if (!permissions.includes('favicon')) {
    return '';
  }

  try {
    const faviconUrl = new URL(api.runtime.getURL('/_favicon/'));
    faviconUrl.searchParams.set('pageUrl', bookmark.url);
    faviconUrl.searchParams.set('size', String(size));
    return faviconUrl.href;
  } catch {
    return '';
  }
}

export function getDirectFaviconUrl(bookmark) {
  if (!bookmark.url || bookmark.invalidUrl) {
    return '';
  }

  try {
    const pageUrl = new URL(bookmark.url);
    if (pageUrl.protocol !== 'http:' && pageUrl.protocol !== 'https:') {
      return '';
    }

    return new URL('/favicon.ico', pageUrl.origin).href;
  } catch {
    return '';
  }
}
