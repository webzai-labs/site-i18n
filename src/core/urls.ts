import { ALL_LOCALES, DEFAULT_LOCALE, type I18nConfig, type LocaleCode } from './locales';

/** Locale encoded in a path prefix (`/he/trails` → 'he'), or null for unprefixed paths. */
export function pathLocale(
  pathname: string,
  locales: readonly LocaleCode[] = ALL_LOCALES,
): LocaleCode | null {
  const match = pathname.match(/^\/([a-zA-Z]{2})(?:\/|$)/);
  if (!match) return null;
  const code = match[1].toLowerCase();
  return (locales as readonly string[]).includes(code) ? (code as LocaleCode) : null;
}

/** Strip any locale prefix: `/he/trails` → `/trails`, `/he` → `/`, `/trails` unchanged. */
export function delocalizePath(
  pathname: string,
  locales: readonly LocaleCode[] = ALL_LOCALES,
): string {
  const locale = pathLocale(pathname, locales);
  if (!locale) return pathname;
  const rest = pathname.slice(locale.length + 1);
  return rest === '' || rest === '/' ? '/' : rest;
}

/**
 * The given path in the given locale. The default locale lives at the root
 * (no prefix); others get `/<locale>` prepended. Idempotent — an already
 * localized path is re-localized, not double-prefixed.
 */
export function localizePath(pathname: string, locale: LocaleCode, config: I18nConfig = {}): string {
  const defaultLocale = config.defaultLocale ?? DEFAULT_LOCALE;
  const base = delocalizePath(
    pathname.startsWith('/') ? pathname : `/${pathname}`,
    config.locales,
  );
  return locale === defaultLocale ? base : `/${locale}${base}`;
}

export interface AlternateLink {
  hreflang: string;
  href: string;
}

export interface AlternatesConfig extends I18nConfig {
  /**
   * Per-locale path overrides for pages whose slug differs across locales
   * (e.g. localized trip slugs). Missing locales fall back to path mirroring.
   */
  alternates?: Partial<Record<LocaleCode, string>>;
}

/**
 * hreflang link data for a path: one entry per supported locale plus
 * x-default pointing at the default-locale URL.
 */
export function getAlternates(
  path: string,
  siteUrl: string,
  config: AlternatesConfig = {},
): AlternateLink[] {
  const locales = config.locales ?? ALL_LOCALES;
  const defaultLocale = config.defaultLocale ?? DEFAULT_LOCALE;
  const origin = siteUrl.replace(/\/+$/, '');
  const hrefFor = (locale: LocaleCode) =>
    origin + (config.alternates?.[locale] ?? localizePath(path, locale, config));
  return [
    ...locales.map((locale) => ({ hreflang: locale, href: hrefFor(locale) })),
    { hreflang: 'x-default', href: hrefFor(defaultLocale) },
  ];
}
