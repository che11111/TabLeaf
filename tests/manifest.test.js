import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}

test('Chromium and Firefox manifests use the same release version', () => {
  const chromium = readJson('extension/manifest.json');
  const firefox = readJson('extension/manifest.firefox.json');
  const packageJson = readJson('package.json');

  assert.equal(firefox.version, chromium.version);
  assert.equal(packageJson.version, chromium.version);
});

test('Firefox manifest includes the required MV3 fallbacks and metadata', () => {
  const firefox = readJson('extension/manifest.firefox.json');

  assert.deepEqual(firefox.background.scripts, ['background.js']);
  assert.equal(firefox.background.service_worker, undefined);
  assert.ok(firefox.browser_specific_settings.gecko.id);
  assert.deepEqual(
    firefox.browser_specific_settings.gecko.data_collection_permissions.required,
    ['none']
  );
  assert.equal(firefox.permissions.includes('favicon'), false);
});

test('both manifests allow large local backups', () => {
  assert.equal(
    readJson('extension/manifest.json').permissions.includes('unlimitedStorage'),
    true
  );
  assert.equal(
    readJson('extension/manifest.firefox.json').permissions.includes('unlimitedStorage'),
    true
  );
});
