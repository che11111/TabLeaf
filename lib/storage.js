import {
  hasValidBookmarks,
  normalizeBookmarkTree
} from './bookmarks.js';
import { t } from './i18n.js';

const BACKUP_KEY = 'tabLeafBookmarks';
const BACKUP_SCHEMA_VERSION = 1;

function getExtensionApi() {
  return globalThis.browser?.storage?.local
    ? globalThis.browser
    : globalThis.chrome;
}

function getRuntimeError(api) {
  try {
    return api?.runtime?.lastError?.message ?? '';
  } catch {
    return '';
  }
}

function callStorage(api, method, ...args) {
  const area = api?.storage?.local;
  if (!area?.[method]) {
    return Promise.reject(new Error(t('storageUnavailable')));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (!settled) {
        settled = true;
        callback(value);
      }
    };

    try {
      const maybePromise = area[method](...args, (result) => {
        const error = getRuntimeError(api);
        if (error) {
          finish(reject, new Error(error));
        } else {
          finish(resolve, result);
        }
      });

      if (maybePromise?.then) {
        maybePromise.then(
          (result) => finish(resolve, result),
          (error) => finish(reject, error)
        );
      }
    } catch (error) {
      finish(reject, error);
    }
  });
}

async function readNativeValue(key = BACKUP_KEY) {
  const api = getExtensionApi();
  if (!api?.storage?.local) {
    return undefined;
  }

  const result = await callStorage(api, 'get', key);
  return result?.[key];
}

export async function readPreference(key) {
  const nativeValue = await readNativeValue(key);
  if (nativeValue !== undefined) {
    return nativeValue;
  }

  try {
    const value = globalThis.localStorage?.getItem(key);
    return value === null || value === undefined
      ? undefined
      : JSON.parse(value);
  } catch {
    return undefined;
  }
}

export async function writePreference(key, value) {
  const api = getExtensionApi();

  if (api?.storage?.local) {
    await callStorage(api, 'set', { [key]: value });
    return;
  }

  globalThis.localStorage?.setItem(key, JSON.stringify(value));
}

function readLegacyValue() {
  try {
    return globalThis.localStorage?.getItem(BACKUP_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function isBackupEnvelope(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray(value.bookmarks)
  );
}

function unpackBackup(value) {
  if (!isBackupEnvelope(value)) {
    return value;
  }

  if (
    value.schemaVersion !== undefined &&
    (
      !Number.isInteger(value.schemaVersion) ||
      value.schemaVersion > BACKUP_SCHEMA_VERSION
    )
  ) {
    throw new Error(t('backupUnsupported'));
  }

  return value.bookmarks;
}

function parseBackup(rawValue) {
  let value;
  try {
    value = typeof rawValue === 'string'
      ? JSON.parse(rawValue)
      : rawValue;
  } catch {
    throw new Error(t('backupInvalid'));
  }

  const bookmarkTree = unpackBackup(value);

  if (
    !Array.isArray(bookmarkTree) &&
    (!bookmarkTree || typeof bookmarkTree !== 'object')
  ) {
    throw new Error(t('backupUnsupported'));
  }

  const bookmarks = normalizeBookmarkTree(bookmarkTree, {
    untitledFolder: t('untitledFolder'),
    untitledBookmark: t('untitledBookmark')
  });

  if (!hasValidBookmarks(bookmarks)) {
    throw new Error(t('backupEmpty'));
  }

  return bookmarks;
}

export async function readBackup() {
  try {
    const nativeValue = await readNativeValue();
    if (nativeValue !== undefined) {
      const bookmarks = parseBackup(nativeValue);
      if (!isBackupEnvelope(nativeValue)) {
        try {
          await saveBackup(bookmarks);
        } catch {
          // The legacy backup remains readable even if migration fails.
        }
      }
      return {
        exists: true,
        bookmarks,
        error: null
      };
    }
  } catch (error) {
    return {
      exists: true,
      bookmarks: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }

  const legacyValue = readLegacyValue();
  if (legacyValue === undefined) {
    return { exists: false, bookmarks: [], error: null };
  }

  try {
    const bookmarks = parseBackup(legacyValue);
    await saveBackup(bookmarks);
    removeLegacyValue();
    return { exists: true, bookmarks, error: null };
  } catch (error) {
    return {
      exists: true,
      bookmarks: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function saveBackup(bookmarks) {
  const backup = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    bookmarks
  };
  const api = getExtensionApi();

  if (api?.storage?.local) {
    await callStorage(api, 'set', { [BACKUP_KEY]: backup });
    return;
  }

  if (!globalThis.localStorage) {
    throw new Error(t('storageUnavailable'));
  }

  globalThis.localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
}

function removeLegacyValue() {
  try {
    globalThis.localStorage?.removeItem(BACKUP_KEY);
  } catch {
    // The native backup has already been written.
  }
}

export async function deleteBackup() {
  const api = getExtensionApi();

  if (api?.storage?.local) {
    await callStorage(api, 'remove', BACKUP_KEY);
  }

  removeLegacyValue();
}
