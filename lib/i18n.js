export const LANGUAGE_STORAGE_KEY = 'tabLeafLanguage';
export const THEME_STORAGE_KEY = 'tabLeafTheme';

export const SUPPORTED_LOCALES = [
  'en',
  'zh_CN',
  'zh_TW',
  'ja',
  'ko',
  'de',
  'fr',
  'es',
  'ru'
];

let activeLocale = 'en';
let activeMessages = {};

function getExtensionApi() {
  return globalThis.browser?.runtime?.getURL
    ? globalThis.browser
    : globalThis.chrome;
}

function browserMessage(key) {
  const i18n = globalThis.browser?.i18n ?? globalThis.chrome?.i18n;

  try {
    return i18n?.getMessage(key) ?? '';
  } catch {
    return '';
  }
}

export function normalizeLocale(locale) {
  const value = String(locale ?? '').trim().replace(/-/g, '_');
  if (!value) {
    return null;
  }

  if (SUPPORTED_LOCALES.includes(value)) {
    return value;
  }

  const language = value.split('_')[0].toLowerCase();
  if (SUPPORTED_LOCALES.includes(language)) {
    return language;
  }

  if (language === 'zh') {
    return value.toLowerCase().includes('tw') ? 'zh_TW' : 'zh_CN';
  }

  return null;
}

async function loadLocaleMessages(locale) {
  const api = getExtensionApi();
  if (!api?.runtime?.getURL) {
    return {};
  }

  const response = await fetch(api.runtime.getURL(`_locales/${locale}/messages.json`));
  if (!response.ok) {
    throw new Error(`Unable to load locale: ${locale}`);
  }

  return response.json();
}

export async function setLanguage(locale) {
  const i18n = globalThis.browser?.i18n ?? globalThis.chrome?.i18n;
  const browserLocale = normalizeLocale(i18n?.getUILanguage?.()) || 'en';
  const normalized = normalizeLocale(locale) || browserLocale;

  try {
    activeMessages = await loadLocaleMessages(normalized);
    activeLocale = normalized;
  } catch {
    activeMessages = {};
    activeLocale = 'en';
  }

  return activeLocale;
}

export function getActiveLocale() {
  return activeLocale;
}

export function t(key, values = {}) {
  const message = activeMessages[key]?.message || browserMessage(key) || key;

  return message.replace(/\{(\w+)\}/g, (placeholder, name) => {
    return Object.hasOwn(values, name)
      ? String(values[name])
      : placeholder;
  });
}

export function getUILanguage() {
  return activeLocale;
}

export function formatSearchMatchCount(count) {
  let category = 'other';

  try {
    category = new Intl.PluralRules(activeLocale.replace('_', '-')).select(count);
  } catch {
    category = count === 1 ? 'one' : 'other';
  }

  const key = `searchMatch_${category}`;
  return t(key, { count });
}

export function applyStaticTranslations(root = document) {
  if (root?.documentElement) {
    root.documentElement.lang = activeLocale.replace('_', '-');
  }

  const attributes = [
    ['data-i18n', 'textContent'],
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-aria-label', 'aria-label'],
    ['data-i18n-alt', 'alt']
  ];

  for (const [dataAttribute, targetAttribute] of attributes) {
    for (const element of root.querySelectorAll(`[${dataAttribute}]`)) {
      const key = element.getAttribute(dataAttribute);
      const value = t(key);
      if (targetAttribute.startsWith('aria-')) {
        element.setAttribute(targetAttribute, value);
      } else {
        element[targetAttribute] = value;
      }
    }
  }
}
