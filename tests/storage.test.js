import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deleteBackup,
  readBackup,
  saveBackup
} from '../extension/lib/storage.js';

const BACKUP_KEY = 'tabLeafBookmarks';

function installStorage(initialValue) {
  const values = new Map();
  if (initialValue !== undefined) {
    values.set(BACKUP_KEY, structuredClone(initialValue));
  }

  globalThis.chrome = {
    runtime: {},
    storage: {
      local: {
        get(key, callback) {
          queueMicrotask(() => callback({
            [key]: values.has(key) ? structuredClone(values.get(key)) : undefined
          }));
        },
        set(items, callback) {
          for (const [key, value] of Object.entries(items)) {
            values.set(key, structuredClone(value));
          }
          queueMicrotask(() => callback());
        },
        remove(key, callback) {
          values.delete(key);
          queueMicrotask(() => callback());
        }
      }
    }
  };

  return values;
}

function validBookmarks() {
  return [{
    title: 'Root',
    isFolder: true,
    children: [{
      title: 'Example',
      isFolder: false,
      url: 'https://example.com/',
      invalidUrl: false,
      originalUrl: ''
    }]
  }];
}

test('saves a versioned backup envelope', async () => {
  const values = installStorage();

  try {
    await saveBackup(validBookmarks());
    const stored = values.get(BACKUP_KEY);

    assert.equal(stored.schemaVersion, 1);
    assert.match(stored.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(stored.bookmarks[0].title, 'Root');

    const backup = await readBackup();
    assert.equal(backup.exists, true);
    assert.equal(backup.error, null);
    assert.equal(backup.bookmarks[0].children[0].title, 'Example');
  } finally {
    delete globalThis.chrome;
  }
});

test('migrates a legacy array backup to the envelope format', async () => {
  const values = installStorage(validBookmarks());

  try {
    const backup = await readBackup();
    assert.equal(backup.error, null);
    assert.equal(backup.bookmarks.length, 1);
    assert.equal(values.get(BACKUP_KEY).schemaVersion, 1);
  } finally {
    delete globalThis.chrome;
  }
});

test('rejects malformed or unsupported backup data', async () => {
  for (const value of [{}, [{ foo: 1 }], {
    schemaVersion: 99,
    bookmarks: validBookmarks()
  }]) {
    installStorage(value);
    try {
      const backup = await readBackup();
      assert.equal(backup.exists, true);
      assert.ok(backup.error);
      assert.deepEqual(backup.bookmarks, []);
    } finally {
      delete globalThis.chrome;
    }
  }
});

test('deletes both native and legacy backup values', async () => {
  const values = installStorage(validBookmarks());
  const localStorageValues = new Map([[BACKUP_KEY, 'legacy']]);
  globalThis.localStorage = {
    getItem(key) {
      return localStorageValues.get(key) ?? null;
    },
    setItem(key, value) {
      localStorageValues.set(key, value);
    },
    removeItem(key) {
      localStorageValues.delete(key);
    }
  };

  try {
    await deleteBackup();
    assert.equal(values.has(BACKUP_KEY), false);
    assert.equal(localStorageValues.has(BACKUP_KEY), false);
  } finally {
    delete globalThis.chrome;
    delete globalThis.localStorage;
  }
});
