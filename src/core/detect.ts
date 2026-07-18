import {
  ALL_LOCALES,
  DEFAULT_LOCALE,
  type I18nConfig,
  type LocaleCode,
} from './locales';
import { pathLocale } from './urls';

/**
 * Country → locale mapping for Cloudflare's `request.cf.country` /
 * `CF-IPCountry` geolocation, used as the last detection signal before the
 * default.
 */
export const COUNTRY_LOCALES: Record<string, LocaleCode> = {
  IL: 'he',
  SA: 'ar',
  AE: 'ar',
  EG: 'ar',
  JO: 'ar',
  MA: 'ar',
  DZ: 'ar',
  TN: 'ar',
  IQ: 'ar',
  KW: 'ar',
  QA: 'ar',
  BH: 'ar',
  OM: 'ar',
  LB: 'ar',
  LY: 'ar',
  YE: 'ar',
  SD: 'ar',
  SY: 'ar',
  PS: 'ar',
};

// Search crawlers, social preview fetchers, SEO tools, AI crawlers, and
// non-browser HTTP clients. These must never be locale-redirected: crawlers
// have to index each URL as-is (hreflang tags describe the alternates), and
// redirecting CLI clients just makes the site hard to script against.
const BOT_PATTERN =
  /bot|crawl|spider|slurp|bingpreview|mediapartners|ia_archiver|facebookexternalhit|facebot|twitterbot|linkedinbot|pinterest|embedly|quora link preview|whatsapp|telegram|skypeuripreview|vkshare|discord|applebot|petalbot|semrush|ahrefs|mj12|dotbot|gptbot|oai-searchbot|claudebot|claude-web|perplexity|ccbot|bytespider|amazonbot|headlesschrome|lighthouse|prerender|curl|wget|python-requests|python-urllib|libcurl|go-http-client|java\//i;

/** True for known crawlers/preview fetchers/HTTP clients. Missing UA counts as a bot. */
export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return BOT_PATTERN.test(userAgent);
}

export interface AcceptLanguageEntry {
  lang: string;
  q: number;
}

/** Parse an Accept-Language header into entries sorted by q-value (descending, stable). */
export function parseAcceptLanguage(header: string | null | undefined): AcceptLanguageEntry[] {
  if (!header) return [];
  const entries: AcceptLanguageEntry[] = [];
  for (const part of header.split(',')) {
    const [lang, ...params] = part.trim().split(';');
    if (!lang) continue;
    let q = 1;
    for (const param of params) {
      const match = param.trim().match(/^q=([0-9.]+)$/i);
      if (match) {
        const parsed = Number(match[1]);
        if (!Number.isNaN(parsed)) q = parsed;
      }
    }
    entries.push({ lang: lang.trim().toLowerCase(), q });
  }
  return entries.filter((e) => e.lang && e.lang !== '*' && e.q > 0).sort((a, b) => b.q - a.q);
}

// Legacy ISO codes still sent by some clients.
const LEGACY_LANGS: Record<string, string> = { iw: 'he' };

/** Best supported locale from an Accept-Language header, or null if none match. */
export function pickFromAcceptLanguage(
  header: string | null | undefined,
  locales: readonly LocaleCode[] = ALL_LOCALES,
): LocaleCode | null {
  for (const { lang } of parseAcceptLanguage(header)) {
    const base = lang.split('-')[0];
    const normalized = LEGACY_LANGS[base] ?? base;
    if ((locales as readonly string[]).includes(normalized)) return normalized as LocaleCode;
  }
  return null;
}

/** Supported locale for a country code, or null. */
export function localeFromCountry(
  country: string | null | undefined,
  locales: readonly LocaleCode[] = ALL_LOCALES,
): LocaleCode | null {
  if (!country) return null;
  const locale = COUNTRY_LOCALES[country.toUpperCase()];
  return locale && (locales as readonly string[]).includes(locale) ? locale : null;
}

/** One cookie value from a request's Cookie header. */
export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() === name) return pair.slice(eq + 1).trim();
  }
  return null;
}

export type LocaleSource = 'cookie' | 'path' | 'accept-language' | 'country' | 'default';

export interface DetectResult {
  locale: LocaleCode;
  source: LocaleSource;
}

export interface DetectOptions extends I18nConfig {
  /**
   * Cloudflare country code when the caller has it (e.g. Astro's
   * `locals.runtime.cf.country`). Falls back to `request.cf.country`, then
   * the `CF-IPCountry` header.
   */
  country?: string | null;
}

/**
 * Preferred locale for a request. Precedence:
 * cookie > URL prefix > Accept-Language > Cloudflare country > default.
 */
export function detectLocale(request: Request, options: DetectOptions = {}): DetectResult {
  const locales = options.locales ?? ALL_LOCALES;
  const defaultLocale = options.defaultLocale ?? DEFAULT_LOCALE;
  const cookieName = options.cookieName ?? 'lang';

  const cookie = getCookie(request, cookieName);
  if (cookie && (locales as readonly string[]).includes(cookie)) {
    return { locale: cookie as LocaleCode, source: 'cookie' };
  }

  const fromPath = pathLocale(new URL(request.url).pathname, locales);
  if (fromPath) return { locale: fromPath, source: 'path' };

  const fromHeader = pickFromAcceptLanguage(request.headers.get('accept-language'), locales);
  if (fromHeader) return { locale: fromHeader, source: 'accept-language' };

  const country =
    options.country ??
    (request as Request & { cf?: { country?: string } }).cf?.country ??
    request.headers.get('cf-ipcountry');
  const fromCountry = localeFromCountry(country, locales);
  if (fromCountry) return { locale: fromCountry, source: 'country' };

  return { locale: defaultLocale, source: 'default' };
}
