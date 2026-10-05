import { cookies } from 'next/headers';
import { getCurrentAdmin } from '../../adminAuth';
import { LANG_COOKIE, dictFor, makeT, normaliseLang } from './index';

/**
 * Language for this request: the cookie set by the one-tap toggle, else the
 * user's saved preference, else Marathi.
 */
export async function getI18n() {
  const fromCookie = cookies().get(LANG_COOKIE)?.value;
  let lang = fromCookie;
  if (!lang) {
    const admin = await getCurrentAdmin().catch(() => null);
    lang = admin?.preferred_lang;
  }
  lang = normaliseLang(lang);
  const dict = dictFor(lang);
  return { lang, dict, t: makeT(dict) };
}
