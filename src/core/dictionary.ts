import type { LocaleCode } from './locales';

export type Dictionary = Record<string, string>;

/**
 * Per-locale string tables. English is the complete reference table; other
 * locales may be partial and fall back to English key-by-key. Sites own their
 * dictionaries (plain objects or imported JSON) — this package only provides
 * the lookup mechanics.
 */
export type DictionarySet<D extends Dictionary = Dictionary> = { en: D } & {
  [L in Exclude<LocaleCode, 'en'>]?: Partial<Record<keyof D, string>>;
};

export type TranslateParams = Record<string, string | number>;

/** `{param}` interpolation. Unknown placeholders are left as-is. */
export function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Translate one key with English fallback; a key missing everywhere returns the key itself. */
export function translate<D extends Dictionary>(
  dictionaries: DictionarySet<D>,
  locale: LocaleCode,
  key: keyof D & string,
  params?: TranslateParams,
): string {
  const localized = locale !== 'en' ? dictionaries[locale]?.[key] : undefined;
  const value = localized ?? dictionaries.en[key] ?? key;
  return interpolate(value, params);
}

export type Translator<D extends Dictionary = Dictionary> = (
  key: keyof D & string,
  params?: TranslateParams,
) => string;

export function createTranslator<D extends Dictionary>(
  dictionaries: DictionarySet<D>,
  locale: LocaleCode,
): Translator<D> {
  return (key, params) => translate(dictionaries, locale, key, params);
}

/** The full table for a locale, with English filling any missing keys — for sites that prefer property access over `t()`. */
export function getDictionary<D extends Dictionary>(
  dictionaries: DictionarySet<D>,
  locale: LocaleCode,
): D {
  if (locale === 'en') return dictionaries.en;
  return { ...dictionaries.en, ...(dictionaries[locale] ?? {}) } as D;
}
