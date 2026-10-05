'use client';

import { createContext, useContext, useMemo } from 'react';
import { makeT } from '../../lib/tms/i18n/t';

const Ctx = createContext({ lang: 'mr', t: (key) => key });

/** Hands the current language's strings to client components. */
export function I18nProvider({ lang, dict, children }) {
  const value = useMemo(() => ({ lang, t: makeT(dict) }), [lang, dict]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  return useContext(Ctx);
}
