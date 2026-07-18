export type Direction = 'ltr' | 'rtl';

export type LocaleCode = 'en' | 'he' | 'ar';

export interface LocaleInfo {
  code: LocaleCode;
  name: string;
  nativeName: string;
  dir: Direction;
}

/** The network-wide locale registry. Sites pick a subset via `I18nConfig.locales`. */
export const LOCALES: Record<LocaleCode, LocaleInfo> = {
  en: { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' },
  he: { code: 'he', name: 'Hebrew', nativeName: 'עברית', dir: 'rtl' },
  ar: { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
};

export const ALL_LOCALES: readonly LocaleCode[] = ['en', 'he', 'ar'];

export const DEFAULT_LOCALE: LocaleCode = 'en';

export interface I18nConfig {
  /** Locales this site serves. Defaults to the full registry. */
  locales?: readonly LocaleCode[];
  /** Served unprefixed at the root. Defaults to 'en'. */
  defaultLocale?: LocaleCode;
  /** Preference cookie name. Defaults to 'lang'. */
  cookieName?: string;
}

export function isLocaleCode(value: string): value is LocaleCode {
  return value in LOCALES;
}

export function localeDir(code: LocaleCode): Direction {
  return LOCALES[code].dir;
}
