import {
  buildSearchIndex,
  normalizeBookmarkTree,
  searchBookmarks
} from './lib/bookmarks.js';
import { parseBookmarkFile } from './lib/import.js';
import {
  renderBookmarkTree,
  renderSearchResults
} from './lib/render.js';
import {
  deleteBackup,
  readBackup,
  readPreference,
  writePreference,
  saveBackup
} from './lib/storage.js';
import { exportCurrentPage } from './lib/export.js';
import { createRequestTracker } from './lib/request-tracker.js';
import {
  LANGUAGE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyStaticTranslations,
  normalizeLocale,
  setLanguage,
  t
} from './lib/i18n.js';

const bookmarksTree = document.getElementById('bookmarks-tree');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const languageSelect = document.getElementById('language-select');
const themeToggle = document.getElementById('theme-toggle');
const collapseToggle = document.getElementById('collapse-toggle');
const collapseToggleLabel = document.getElementById('collapse-toggle-label');
const importButton = document.getElementById('import-button');
const exportButton = document.getElementById('export-button');
const statusMessage = document.getElementById('status-message');

const state = {
  bookmarks: [],
  searchIndex: [],
  collapsedFolders: new Set(),
  source: 'none',
  backup: { exists: false, bookmarks: [], error: null }
};

let searchTimer;
let reloadTimer;
let statusTimer;
let viewVersion = 0;
let themePreference = 'system';
const sourceTracker = createRequestTracker();
const nativeLoadTracker = createRequestTracker();

const darkModeQuery = globalThis.matchMedia?.('(prefers-color-scheme: dark)');

function getBookmarkApi() {
  return globalThis.browser?.bookmarks
    ? globalThis.browser
    : globalThis.chrome;
}

function getBookmarkTree(api) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (!settled) {
        settled = true;
        callback(value);
      }
    };

    try {
      const maybePromise = api.bookmarks.getTree((tree) => {
        const error = api.runtime?.lastError?.message;
        if (error) {
          finish(reject, new Error(error));
        } else {
          finish(resolve, tree);
        }
      });

      if (maybePromise?.then) {
        maybePromise.then(
          (tree) => finish(resolve, tree),
          (error) => finish(reject, error)
        );
      }
    } catch (error) {
      finish(reject, error);
    }
  });
}

function showStatus(message, type = 'info') {
  clearTimeout(statusTimer);
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  statusMessage.hidden = false;

  statusTimer = setTimeout(() => {
    statusMessage.hidden = true;
  }, 4000);
}

function getResolvedTheme(preference = themePreference) {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }
  return darkModeQuery?.matches ? 'dark' : 'light';
}

function syncThemeToggle() {
  const resolvedTheme = getResolvedTheme();
  const label = t(
    resolvedTheme === 'dark' ? 'themeSwitchToLight' : 'themeSwitchToDark'
  );
  themeToggle.setAttribute('aria-label', label);
  themeToggle.setAttribute('title', label);
}

function applyThemePreference(preference) {
  themePreference = ['light', 'dark', 'system'].includes(preference)
    ? preference
    : 'system';
  document.documentElement.dataset.theme = getResolvedTheme();
  syncThemeToggle();
}

function getFolderHeaders() {
  return Array.from(bookmarksTree.querySelectorAll('.folder-header'));
}

function isEverythingCollapsed(headers = getFolderHeaders()) {
  return (
    headers.length > 0 &&
    headers.every((header) => header.getAttribute('aria-expanded') === 'false')
  );
}

function syncCollapseToggle() {
  const headers = getFolderHeaders();
  const allCollapsed = isEverythingCollapsed(headers);
  const label = t(allCollapsed ? 'expandAll' : 'collapseAll');

  collapseToggle.disabled = headers.length === 0;
  collapseToggle.setAttribute('aria-label', label);
  collapseToggleLabel.textContent = label;
}

async function initializeTheme() {
  try {
    applyThemePreference(
      await readPreference(THEME_STORAGE_KEY) || 'system'
    );
  } catch {
    applyThemePreference('system');
  }

  darkModeQuery?.addEventListener?.('change', () => {
    if (themePreference === 'system') {
      applyThemePreference('system');
    }
  });
}

function createActionButton({ label, className = 'action-btn', onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function renderPanel(container, { title, message, actions = [] }) {
  const panel = document.createElement('section');
  panel.className = 'state-panel';

  const heading = document.createElement('h2');
  heading.textContent = title;
  panel.append(heading);

  if (message) {
    const description = document.createElement('p');
    description.textContent = message;
    panel.append(description);
  }

  if (actions.length > 0) {
    const actionList = document.createElement('div');
    actionList.className = 'state-actions';
    actionList.append(...actions);
    panel.append(actionList);
  }

  container.replaceChildren(panel);
}

function renderEmptyState() {
  const actions = [
    createActionButton({
      label: t('importBookmarks'),
      className: 'action-btn primary',
      onClick: importBookmarks
    })
  ];

  if (state.backup.bookmarks.length > 0) {
    actions.push(createActionButton({
      label: t('restoreLocalBackup'),
      onClick: restoreBackup
    }));
  }

  if (state.backup.exists && state.backup.error) {
    actions.push(createActionButton({
      label: t('deleteDamagedBackup'),
      className: 'action-btn danger',
      onClick: removeBackup
    }));
  }

  renderPanel(bookmarksTree, {
    title: t('noBookmarksTitle'),
    message: t('noBookmarksMessage'),
    actions
  });
}

function renderLoadError(error) {
  const actions = [
    createActionButton({
      label: t('retry'),
      className: 'action-btn primary',
      onClick: () => loadNativeBookmarks()
    }),
    createActionButton({
      label: t('importBookmarks'),
      onClick: importBookmarks
    })
  ];

  if (state.backup.bookmarks.length > 0) {
    actions.push(createActionButton({
      label: t('restoreLocalBackup'),
      onClick: restoreBackup
    }));
  }

  if (state.backup.exists) {
    actions.push(createActionButton({
      label: t('deleteLocalBackup'),
      className: 'action-btn danger',
      onClick: removeBackup
    }));
  }

  renderPanel(bookmarksTree, {
    title: t('unableLoadTitle'),
    message: error instanceof Error ? error.message : String(error),
    actions
  });
}

function renderCurrentView() {
  const version = ++viewVersion;
  const query = searchInput.value.trim();

  if (query) {
    const results = searchBookmarks(state.bookmarks, query, state.searchIndex);
    if (results.length > 0) {
      renderSearchResults(bookmarksTree, results, query);
    } else {
      renderPanel(bookmarksTree, {
        title: t('noMatchesTitle'),
        message: t('noMatchesMessage', { query })
      });
    }
  } else if (state.bookmarks.length > 0) {
    renderBookmarkTree(
      bookmarksTree,
      state.bookmarks,
      state.collapsedFolders
    );
  } else if (state.source === 'none') {
    renderPanel(bookmarksTree, {
      title: t('loadingTitle')
    });
  } else {
    renderEmptyState();
  }

  syncCollapseToggle();

  if (version === viewVersion) {
    bookmarksTree.setAttribute('aria-busy', 'false');
  }
}

function setBookmarkData(bookmarks, source) {
  state.bookmarks = bookmarks;
  state.searchIndex = buildSearchIndex(bookmarks);
  state.source = source;
}

async function loadNativeBookmarks({ quiet = false } = {}) {
  const api = getBookmarkApi();
  if (!api?.bookmarks?.getTree) {
    state.source = 'error';
    renderLoadError(new Error(t('apiUnavailable')));
    return;
  }

  const sourceToken = sourceTracker.current();
  const loadToken = nativeLoadTracker.begin();
  const isCurrentLoad = () => {
    return (
      sourceTracker.isCurrent(sourceToken) &&
      nativeLoadTracker.isCurrent(loadToken)
    );
  };

  bookmarksTree.setAttribute('aria-busy', 'true');

  try {
    const tree = await getBookmarkTree(api);
    if (!isCurrentLoad()) {
      return;
    }

    const bookmarks = normalizeBookmarkTree(tree, {
      untitledFolder: t('untitledFolder'),
      untitledBookmark: t('untitledBookmark')
    });
    setBookmarkData(bookmarks, 'native');
    renderCurrentView();
  } catch (error) {
    if (!isCurrentLoad()) {
      return;
    }

    if (quiet && state.bookmarks.length > 0) {
      showStatus(t('refreshFailed'), 'error');
    } else {
      state.source = 'error';
      renderLoadError(error);
    }
  } finally {
    if (nativeLoadTracker.isCurrent(loadToken)) {
      bookmarksTree.setAttribute('aria-busy', 'false');
    }
  }
}

function chooseBookmarkFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.htm,.json,text/html,application/json';
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
    }, { once: true });
    input.click();
  });
}

async function importBookmarks() {
  const file = await chooseBookmarkFile();
  if (!file) {
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    showStatus(t('fileTooLarge'), 'error');
    return;
  }

  try {
    const bookmarks = parseBookmarkFile(await file.text(), file.name);
    clearTimeout(reloadTimer);
    sourceTracker.invalidate();
    setBookmarkData(bookmarks, 'imported');
    searchInput.value = '';
    renderCurrentView();

    try {
      await saveBackup(bookmarks);
      state.backup = { exists: true, bookmarks, error: null };
      showStatus(t('importSuccess'), 'success');
    } catch (error) {
      showStatus(
        t('importBackupFailed', { error: error.message }),
        'error'
      );
    }
  } catch (error) {
    showStatus(
      error instanceof Error ? error.message : t('importUnsupported'),
      'error'
    );
  }
}

async function refreshBackup() {
  try {
    state.backup = await readBackup();
  } catch (error) {
    state.backup = {
      exists: true,
      bookmarks: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function restoreBackup() {
  if (state.backup.bookmarks.length === 0) {
    showStatus(t('noReadableBackup'), 'error');
    return;
  }

  clearTimeout(reloadTimer);
  sourceTracker.invalidate();
  setBookmarkData(state.backup.bookmarks, 'imported');
  searchInput.value = '';
  renderCurrentView();
  showStatus(t('restoreSuccess'), 'success');
}

async function removeBackup() {
  if (!window.confirm(t('deleteBackupConfirm'))) {
    return;
  }

  try {
    await deleteBackup();
    state.backup = { exists: false, bookmarks: [], error: null };
    showStatus(t('backupDeleted'), 'success');
    renderCurrentView();
  } catch (error) {
    showStatus(t('backupDeleteFailed', { error: error.message }), 'error');
  }
}

function scheduleNativeReload() {
  if (state.source !== 'native') {
    return;
  }

  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    if (state.source === 'native') {
      loadNativeBookmarks({ quiet: true });
    }
  }, 150);
}

function subscribeToBookmarkChanges() {
  const api = getBookmarkApi();
  const events = [
    'onCreated',
    'onRemoved',
    'onChanged',
    'onMoved',
    'onChildrenReordered',
    'onImportEnded'
  ];

  for (const eventName of events) {
    api?.bookmarks?.[eventName]?.addListener(scheduleNativeReload);
  }
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  clearTimeout(searchTimer);
  renderCurrentView();
});

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderCurrentView, 120);
});

searchInput.addEventListener('search', () => {
  clearTimeout(searchTimer);
  renderCurrentView();
});

searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    searchInput.value = '';
    renderCurrentView();
  }
});

bookmarksTree.addEventListener('click', (event) => {
  const header = event.target.closest('.folder-header');
  if (!header) {
    return;
  }

  const folder = header.closest('.folder');
  const key = header.dataset.folderKey;
  const isCollapsed = !folder.classList.contains('collapsed');

  folder.classList.toggle('collapsed', isCollapsed);
  header.setAttribute('aria-expanded', String(!isCollapsed));

  if (isCollapsed) {
    state.collapsedFolders.add(key);
  } else {
    state.collapsedFolders.delete(key);
  }

  syncCollapseToggle();
});

collapseToggle.addEventListener('click', () => {
  const headers = getFolderHeaders();
  if (headers.length === 0) {
    return;
  }

  if (isEverythingCollapsed(headers)) {
    state.collapsedFolders.clear();
  } else {
    for (const header of headers) {
      state.collapsedFolders.add(header.dataset.folderKey);
    }
  }

  renderCurrentView();
});

languageSelect.addEventListener('change', async () => {
  const locale = await setLanguage(languageSelect.value);
  languageSelect.value = locale;
  applyStaticTranslations();
  syncThemeToggle();
  renderCurrentView();

  try {
    await writePreference(LANGUAGE_STORAGE_KEY, locale);
  } catch {
    // The selected language still applies for the current session.
  }

  showStatus(t('languageChanged', {
    language: languageSelect.selectedOptions[0]?.textContent || locale
  }), 'success');
});

themeToggle.addEventListener('click', async () => {
  const nextPreference = getResolvedTheme() === 'dark' ? 'light' : 'dark';
  applyThemePreference(nextPreference);

  try {
    await writePreference(THEME_STORAGE_KEY, nextPreference);
  } catch {
    // The theme still applies for the current session.
  }
});

importButton.addEventListener('click', importBookmarks);

exportButton.addEventListener('click', async () => {
  const query = searchInput.value.trim();
  const results = query
    ? searchBookmarks(state.bookmarks, query, state.searchIndex)
    : null;

  if (
    state.bookmarks.length === 0 ||
    (results && results.length === 0)
  ) {
    showStatus(t('exportNoBookmarks'), 'error');
    return;
  }

  try {
    await exportCurrentPage(document.querySelector('.bookmarks-container'));
    showStatus(t('exportSuccess'), 'success');
  } catch (error) {
    showStatus(t('exportFailed', { error: error.message }), 'error');
  }
});

async function initialize() {
  let preferredLanguage;
  try {
    preferredLanguage = await readPreference(LANGUAGE_STORAGE_KEY);
  } catch {
    preferredLanguage = undefined;
  }

  const locale = await setLanguage(normalizeLocale(preferredLanguage));
  languageSelect.value = locale;
  applyStaticTranslations();
  await initializeTheme();
  subscribeToBookmarkChanges();
  await refreshBackup();
  await loadNativeBookmarks();
}

initialize();
