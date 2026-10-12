/**
 * Translations for the management system. Every visible string lives in
 * mr.js and en.js under the same key. Marathi is the default language.
 * Server-side entry point: it loads both dictionaries. Browser code gets the
 * current dictionary from the layout and uses ./t.js directly.
 */
import mr from './mr';
import en from './en';
import { en as extraEn, mr as extraMr } from './extra';
import { makeT as baseMakeT } from './t';

export const LANGS = ['mr', 'en'];
export const DEFAULT_LANG = 'mr';
export const LANG_COOKIE = 'ckp_tms_lang';

const EN = { ...en, ...extraEn };
const DICTS = { mr: { ...mr, ...extraMr }, en: EN };

export function normaliseLang(value) {
  return LANGS.includes(value) ? value : DEFAULT_LANG;
}

export function dictFor(lang) {
  return DICTS[normaliseLang(lang)];
}

/** t(key, vars) for a dictionary, falling back to English for any key it lacks. */
export function makeT(dict) {
  return baseMakeT(dict, EN);
}
