import {
  getUILanguage,
  t
} from './i18n.js';

function getStylesheetText() {
  const sheet = Array.from(document.styleSheets).find(
    (candidate) => candidate.href?.endsWith('/styles.css')
  );

  if (!sheet) {
    return '';
  }

  try {
    return Array.from(sheet.cssRules)
      .map((rule) => rule.cssText)
      .join('\n');
  } catch {
    return '';
  }
}

function getExtensionApi() {
  return globalThis.browser?.runtime?.getURL
    ? globalThis.browser
    : globalThis.chrome;
}

async function getLogoDataUrl() {
  const api = getExtensionApi();
  if (!api?.runtime?.getURL) {
    return '';
  }

  try {
    const response = await fetch(api.runtime.getURL('images/favicon-128x128.png'));
    const blob = await response.blob();

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function fetchFaviconDataUrl(source, deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new Error('Favicon export deadline exceeded');
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(3000, remaining)
  );

  try {
    const response = await fetch(source, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Favicon request failed: ${response.status}`);
    }
    return await blobToDataUrl(await response.blob());
  } finally {
    clearTimeout(timeout);
  }
}

async function forEachWithConcurrency(items, limit, callback) {
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await callback(item);
    }
  });

  await Promise.all(workers);
}

async function inlineFavicons(container) {
  const clone = container.cloneNode(true);
  const images = Array.from(clone.querySelectorAll('img.bookmark-icon'));
  const cache = new Map();
  const deadline = Date.now() + 8000;

  const showFallback = (image) => {
    const fallback = image.parentElement?.querySelector('.bookmark-fallback');
    image.remove();
    if (fallback) {
      fallback.hidden = false;
    }
  };

  await forEachWithConcurrency(images, 6, async (image) => {
    const source = image.src;

    try {
      if (!source || Date.now() >= deadline) {
        throw new Error('Favicon export deadline exceeded');
      }

      if (!cache.has(source)) {
        cache.set(
          source,
          fetchFaviconDataUrl(source, deadline)
        );
      }

      image.src = await cache.get(source);
      image.hidden = false;
      image.classList.remove('is-loading');
      const fallback = image.parentElement?.querySelector('.bookmark-fallback');
      if (fallback) {
        fallback.hidden = true;
      }
    } catch {
      showFallback(image);
    }
  });

  return clone.innerHTML;
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = value;
  return element.innerHTML;
}

function toIsoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function serializeForInlineScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export async function exportCurrentPage(container) {
  const [logoDataUrl, stylesheet, bookmarksHtml] = await Promise.all([
    getLogoDataUrl(),
    Promise.resolve(getStylesheetText()),
    inlineFavicons(container)
  ]);

  const exportedAt = new Date();
  const title = t('exportPageTitle');
  const logo = logoDataUrl
    ? `<img class="export-logo" src="${logoDataUrl}" alt="">`
    : '';
  const exportLocale = getUILanguage().replace('_', '-');
  const exportTheme = document.documentElement.dataset.theme === 'dark'
    ? 'dark'
    : 'light';
  const searchMessages = Object.fromEntries([
    'searchMatch_one',
    'searchMatch_few',
    'searchMatch_many',
    'searchMatch_other'
  ].map((key) => [key, t(key)]));

  const html = `<!DOCTYPE html>
<html lang="${exportLocale}" data-theme="${exportTheme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${stylesheet}</style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">
        ${logo}
        <h1>${escapeHtml(t('exportPageTitle'))}</h1>
      </div>
      <form class="search-container" id="search-form" role="search">
        <label class="visually-hidden" for="search-input">${escapeHtml(t('searchLabel'))}</label>
        <input type="search" id="search-input" placeholder="${escapeHtml(t('searchPlaceholder'))}" autocomplete="off">
        <button id="search-button" type="submit" aria-label="${escapeHtml(t('searchButton'))}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"></path>
          </svg>
        </button>
      </form>
    </header>
    <div class="export-search-status" id="search-status" role="status" aria-live="polite" hidden></div>
    <main>
      <div class="bookmarks-container" id="export-bookmarks-container">
        ${bookmarksHtml}
      </div>
      <div class="no-bookmarks" id="search-empty" hidden>${escapeHtml(t('noMatchesTitle'))}</div>
    </main>
    <footer>
      <p>${escapeHtml(t('exportFooter', {
        date: exportedAt.toLocaleDateString()
      }))}</p>
    </footer>
  </div>
  <script>
    (() => {
      const locale = ${serializeForInlineScript(exportLocale)};
      const searchMessages = ${serializeForInlineScript(searchMessages)};
      const form = document.getElementById('search-form');
      const input = document.getElementById('search-input');
      const status = document.getElementById('search-status');
      const container = document.getElementById('export-bookmarks-container');
      const emptyState = document.getElementById('search-empty');
      const folders = Array.from(document.querySelectorAll('.folder'));
      const bookmarks = Array.from(document.querySelectorAll('.bookmark-item'));
      const originalTitles = new WeakMap();
      let searchTimer;

      for (const bookmark of bookmarks) {
        const title = bookmark.querySelector('.bookmark-title');
        if (title) {
          originalTitles.set(title, title.textContent);
        }
      }

      function normalizeSearchText(value) {
        return String(value ?? '')
          .normalize('NFKD')
          .toLowerCase()
          .replace(/\\p{M}/gu, '')
          .replace(/ß/g, 'ss');
      }

      function findSearchRanges(text, query) {
        const term = normalizeSearchText(query).trim();
        if (!term) {
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
        let matchIndex = normalizedText.indexOf(term);

        while (matchIndex !== -1) {
          const matchEnd = matchIndex + term.length;
          ranges.push({
            start: originalStarts[matchIndex] ?? text.length,
            end: originalEnds[matchEnd - 1] ?? text.length
          });
          matchIndex = normalizedText.indexOf(term, matchEnd);
        }

        return ranges;
      }

      function highlight(titleElement, text, term) {
        let cursor = 0;
        const fragment = document.createDocumentFragment();

        for (const { start, end } of findSearchRanges(text, term)) {
          if (start > cursor) {
            fragment.append(document.createTextNode(
              text.slice(cursor, start)
            ));
          }

          const mark = document.createElement('mark');
          mark.className = 'highlight';
          mark.textContent = text.slice(start, end);
          fragment.append(mark);
          cursor = end;
        }

        if (cursor < text.length) {
          fragment.append(document.createTextNode(text.slice(cursor)));
        }

        titleElement.replaceChildren(fragment);
      }

      function resetTitles() {
        for (const bookmark of bookmarks) {
          const title = bookmark.querySelector('.bookmark-title');
          if (title && originalTitles.has(title)) {
            title.textContent = originalTitles.get(title);
          }
        }
      }

      function formatCount(count) {
        let category = 'other';
        try {
          category = new Intl.PluralRules(locale).select(count);
        } catch {
          category = count === 1 ? 'one' : 'other';
        }

        const template = searchMessages['searchMatch_' + category] ||
          searchMessages.searchMatch_other;
        return template.replace('{count}', String(count));
      }

      function applySearch() {
        const term = normalizeSearchText(input.value).trim();
        resetTitles();

        if (!term) {
          for (const bookmark of bookmarks) {
            bookmark.hidden = false;
          }
          for (const folder of folders) {
            folder.hidden = false;
          }
          container.hidden = false;
          emptyState.hidden = true;
          status.hidden = true;
          return;
        }

        let matchCount = 0;

        for (const bookmark of bookmarks) {
          const title = bookmark.querySelector('.bookmark-title');
          const titleText = title ? originalTitles.get(title) || '' : '';
          const href = bookmark.getAttribute('href') || '';
          const titleMatches = normalizeSearchText(titleText).includes(term);
          const hrefMatches = normalizeSearchText(href).includes(term);
          const matches = titleMatches || hrefMatches;

          bookmark.hidden = !matches;
          if (matches) {
            matchCount += 1;
            if (titleMatches && title) {
              highlight(title, titleText, term);
            }
          }
        }

        for (const folder of [...folders].reverse()) {
          folder.hidden = !folder.querySelector('.bookmark-item:not([hidden])');
        }

        container.hidden = matchCount === 0;
        emptyState.hidden = matchCount !== 0;
        status.textContent = formatCount(matchCount);
        status.hidden = false;
      }

      document.querySelectorAll('.folder-header').forEach((header) => {
        header.addEventListener('click', () => {
          const folder = header.closest('.folder');
          const expanded = header.getAttribute('aria-expanded') !== 'false';
          folder.classList.toggle('collapsed', expanded);
          header.setAttribute('aria-expanded', String(!expanded));
        });
      });

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        clearTimeout(searchTimer);
        applySearch();
      });

      input.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(applySearch, 100);
      });

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          input.value = '';
          applySearch();
        }
      });
    })();
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `TabLeaf-Bookmarks-${toIsoDate(exportedAt)}.html`;
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
