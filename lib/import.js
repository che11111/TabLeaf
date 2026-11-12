import {
  hasValidBookmarks,
  normalizeBookmarkTree,
  normalizeBookmarkUrl
} from './bookmarks.js';
import { t } from './i18n.js';

function directChildren(element, tagName) {
  if (!element) {
    return [];
  }

  return Array.from(element.children).filter(
    (child) => child.tagName === tagName
  );
}

function firstDirectChild(element, tagName) {
  return directChildren(element, tagName)[0] ?? null;
}

function parseBookmarkList(listElement) {
  if (!listElement) {
    return [];
  }

  const bookmarks = [];

  for (const item of directChildren(listElement, 'DT')) {
    const link = firstDirectChild(item, 'A');
    if (link) {
      const href = link.getAttribute('href') ?? '';
      bookmarks.push({
        title: link.textContent.trim(),
        url: href
      });
      continue;
    }

    const heading = firstDirectChild(item, 'H3');
    if (!heading) {
      continue;
    }

    const nestedList = firstDirectChild(item, 'DL');
    bookmarks.push({
      title: heading.textContent.trim(),
      children: parseBookmarkList(nestedList)
    });
  }

  return bookmarks;
}

function collectFallbackLinks(doc) {
  const bookmarks = [];
  const seen = new Set();

  for (const link of doc.querySelectorAll('a[href]')) {
    const rawUrl = link.getAttribute('href') ?? '';
    const normalizedUrl = normalizeBookmarkUrl(rawUrl);
    if (!normalizedUrl.valid) {
      continue;
    }

    const title = link.textContent.trim() || normalizedUrl.url;
    const key = `${normalizedUrl.url}\n${title}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    bookmarks.push({ title, url: normalizedUrl.url });
  }

  return bookmarks;
}

export function parseHtmlBookmarks(doc) {
  const rootList = doc.querySelector('dl');
  const parsed = parseBookmarkList(rootList);
  return parsed.length > 0 ? parsed : collectFallbackLinks(doc);
}

export function parseBookmarkFile(text, fileName, parser = globalThis.DOMParser) {
  const extension = String(fileName ?? '').split('.').pop()?.toLowerCase();
  let rawBookmarks;

  if (extension === 'json') {
    try {
      rawBookmarks = JSON.parse(text);
    } catch {
      throw new Error(t('invalidJson'));
    }
  } else if (extension === 'html' || extension === 'htm') {
    if (typeof parser !== 'function') {
      throw new Error(t('importHtmlUnavailable'));
    }
    const doc = new parser().parseFromString(text, 'text/html');
    rawBookmarks = parseHtmlBookmarks(doc);
  } else {
    throw new Error(t('importUnsupported'));
  }

  const bookmarks = normalizeBookmarkTree(rawBookmarks, {
    untitledFolder: t('untitledFolder'),
    untitledBookmark: t('untitledBookmark')
  });
  if (!hasValidBookmarks(bookmarks)) {
    throw new Error(t('importNotFound'));
  }

  return bookmarks;
}
