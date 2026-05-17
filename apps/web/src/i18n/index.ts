/**
 * Lightweight i18n system — no external deps.
 * Supports nested keys ("automations.title"), {{var}} interpolation,
 * and RTL direction for Hebrew.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import en from './en.json';
import ru from './ru.json';
import he from './he.json';

export type Language = 'en' | 'ru' | 'he';

const translations: Record<Language, Record<string, unknown>> = { en, ru, he };

export const RTL_LANGS: Language[] = ['he'];

/** Walk a nested JSON object by dotted key path. */
function getNestedValue(obj: Record<string, unknown>, key: string): string | undefined {
  const parts = key.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/** Substitute {{var}} placeholders from a vars map. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? `{{${k}}}`));
}

interface LangStore {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const useLangStore = create<LangStore>()(
  persist(
    (set) => ({
      language: 'en',
      setLanguage: (language) => {
        set({ language });
        // Apply RTL direction immediately
        document.documentElement.dir = RTL_LANGS.includes(language) ? 'rtl' : 'ltr';
        document.documentElement.lang = language;
      },
    }),
    { name: 'victory-lang' }
  )
);

/** Main translation hook. Returns t() function bound to current language. */
export function useT() {
  const language = useLangStore((s) => s.language);
  return (key: string, vars?: Record<string, string | number>): string => {
    const dict = translations[language] as Record<string, unknown>;
    const val = getNestedValue(dict, key);
    if (val !== undefined) return interpolate(val, vars);
    // Fallback to English
    const fallback = getNestedValue(translations.en as Record<string, unknown>, key);
    if (fallback !== undefined) return interpolate(fallback, vars);
    // Last resort: return the key itself
    return key;
  };
}

/** Apply direction from stored language on app boot. */
export function applyStoredDirection() {
  const lang = useLangStore.getState().language;
  document.documentElement.dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
}
