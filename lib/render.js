import {
  findSearchRanges,
  getDirectFaviconUrl,
  getFaviconUrl
} from './bookmarks.js';
import {
  formatSearchMatchCount,
  t
} from './i18n.js';

let folderContentId = 0;

function createFolderKey(path, index) {
  return JSON.stringify([...path, index]);
}

function appendHighlightedText(element, text, query) {
  const ranges = findSearchRanges(text, query);
  if (ranges.length === 0) {
    element.textContent = text;
    return;
  }

  let cursor = 0;
  for (const { start, end } of ranges) {
    if (start > cursor) {
      element.append(document.createTextNode(text.slice(cursor, start)));
    }

    const mark = document.createElement('mark');
    mark.className = 'highlight';
    mark.textContent = text.slice(start, end);
    element.append(mark);
    cursor = end;
  }

  if (cursor < text.length) {
    element.append(document.createTextNode(text.slice(cursor)));
  }
}

function hasVisiblePixels(image) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const alpha = pixels[index + 3];

      if (
        alpha > 8 &&
        (red < 245 || green < 245 || blue < 245)
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

function createFavicon(bookmark) {
  const fallback = document.createElement('span');
  fallback.className = 'bookmark-fallback';
  fallback.setAttribute('aria-hidden', 'true');
  fallback.textContent = bookmark.title.slice(0, 1).toUpperCase() || '•';

  const sources = [
    { url: getFaviconUrl(bookmark), inspectPixels: true },
    { url: getDirectFaviconUrl(bookmark), inspectPixels: false }
  ].filter((source, index, list) => {
    return source.url && list.findIndex((item) => item.url === source.url) === index;
  });

  if (sources.length === 0) {
    return fallback;
  }

  const image = document.createElement('img');
  image.className = 'bookmark-icon is-loading';
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.classList.add('is-loading');

  let sourceIndex = 0;

  const showFallback = () => {
    image.removeEventListener('load', handleLoad);
    image.removeEventListener('error', handleError);
    image.remove();
    fallback.hidden = false;
  };

  const tryNextSource = () => {
    sourceIndex += 1;
    if (sourceIndex >= sources.length) {
      showFallback();
      return;
    }

    image.src = sources[sourceIndex].url;
  };

  const handleLoad = () => {
    const source = sources[sourceIndex];
    if (source.inspectPixels && !hasVisiblePixels(image)) {
      tryNextSource();
      return;
    }

    image.removeEventListener('load', handleLoad);
    image.removeEventListener('error', handleError);
    fallback.hidden = true;
    image.classList.remove('is-loading');
  };

  const handleError = () => {
    tryNextSource();
  };

  image.addEventListener('load', handleLoad);
  image.addEventListener('error', handleError);
  image.src = sources[0].url;

  fallback.hidden = false;
  const wrapper = document.createElement('span');
  wrapper.className = 'bookmark-icon-wrap';
  wrapper.append(image, fallback);
  return wrapper;
}

function createBookmarkItem(bookmark, { path = [], query = '' } = {}) {
  const item = document.createElement(bookmark.invalidUrl ? 'div' : 'a');
  item.className = 'bookmark-item';

  if (bookmark.invalidUrl) {
    item.classList.add('bookmark-item-invalid');
    item.setAttribute('aria-disabled', 'true');
  } else {
    item.href = bookmark.url;
    item.target = '_blank';
    item.rel = 'noopener noreferrer';
  }

  item.append(createFavicon(bookmark));

  const content = document.createElement('span');
  content.className = 'bookmark-content';

  const title = document.createElement('span');
  title.className = 'bookmark-title';
  appendHighlightedText(title, bookmark.title, query);
  content.append(title);

  if (path.length > 0 && query) {
    const pathLabel = document.createElement('span');
    pathLabel.className = 'bookmark-path';
    pathLabel.textContent = path.join(' / ');
    content.append(pathLabel);
  }

  if (bookmark.invalidUrl) {
    const warning = document.createElement('span');
    warning.className = 'bookmark-warning';
    warning.textContent = bookmark.originalUrl
      ? t('invalidUrl')
      : t('noValidUrl');
    content.append(warning);
  }

  item.append(content);
  return item;
}

function createFolder(node, path, index, collapsedFolders) {
  const key = createFolderKey(path, index);
  const isCollapsed = collapsedFolders.has(key);
  const contentId = `folder-content-${folderContentId++}`;

  const folder = document.createElement('div');
  folder.className = 'folder';
  folder.classList.toggle('collapsed', isCollapsed);

  const header = document.createElement('button');
  header.className = 'folder-header';
  header.type = 'button';
  header.dataset.folderKey = key;
  header.setAttribute('aria-expanded', String(!isCollapsed));
  header.setAttribute('aria-controls', contentId);

  const folderIcon = document.createElement('span');
  folderIcon.className = 'folder-icon';
  folderIcon.setAttribute('aria-hidden', 'true');

  const toggleIcon = document.createElement('span');
  toggleIcon.className = 'toggle-icon';
  toggleIcon.setAttribute('aria-hidden', 'true');

  const name = document.createElement('span');
  name.className = 'folder-name';
  name.textContent = node.title;

  header.append(folderIcon, toggleIcon, name);

  const content = document.createElement('div');
  content.className = 'folder-content';
  content.id = contentId;
  content.append(renderNodes(node.children, [...path, index], collapsedFolders));

  folder.append(header, content);
  return folder;
}

function renderNodes(nodes, path, collapsedFolders) {
  const fragment = document.createDocumentFragment();

  nodes.forEach((node, index) => {
    if (node.isFolder) {
      fragment.append(createFolder(node, path, index, collapsedFolders));
    } else {
      fragment.append(createBookmarkItem(node));
    }
  });

  return fragment;
}

export function renderBookmarkTree(container, nodes, collapsedFolders = new Set()) {
  container.replaceChildren(renderNodes(nodes, [], collapsedFolders));
}

export function renderSearchResults(container, results, query) {
  const fragment = document.createDocumentFragment();
  const header = document.createElement('div');
  header.className = 'search-results-header';

  const heading = document.createElement('h2');
  heading.textContent = formatSearchMatchCount(results.length);
  header.append(heading);

  const resultsList = document.createElement('div');
  resultsList.className = 'search-results';

  for (const { bookmark, path } of results) {
    resultsList.append(createBookmarkItem(bookmark, { path, query }));
  }

  fragment.append(header, resultsList);
  container.replaceChildren(fragment);
}
