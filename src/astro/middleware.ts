import {
  ALL_LOCALES,
  DEFAULT_LOCALE,
  localeDir,
  type Direction,
  type I18nConfig,
  type LocaleCode,
} from '../core/locales';
import { detectLocale, getCookie, isBot } from '../core/detect';
import { createTranslator, type DictionarySet, type Translator } from '../core/dictionary';
import { localizePath, pathLocale } from '../core/urls';

/** What the middleware puts on `Astro.locals` — extend `App.Locals` with this in the site's env.d.ts. */
export interface I18nLocals {
  locale: LocaleCode;
  dir: Direction;
  t: Translator;
}

// Typed structurally rather than via `astro:middleware` so the package has no
// build-time dependency on an Astro project (core stays usable from plain
// Workers, and vitest can run without an Astro toolchain).
export interface I18nMiddlewareContext {
  request: Request;
  url: URL;
  // `any` (not `unknown`) so a consumer's App.Locals interface is assignable
  // without an index signature.
  locals: Record<string, any>;
  redirect: (path: string, status?: number) => Response;
}

export type I18nMiddlewareNext = () => Promise<Response>;

export interface I18nMiddlewareOptions extends I18nConfig {
  /** Site dictionaries; when provided, `locals.t` is a bound translator. */
  dictionaries?: DictionarySet;
  /** Preference cookie lifetime in seconds. Default one year. */
  cookieMaxAge?: number;
  /**
   * Unprefixed paths that must never be locale-redirected. Default skips
   * paths with a file extension (feeds, assets) and `/_`/`/api/` prefixes.
   */
  excludeRedirect?: (pathname: string) => boolean;
  /** Cloudflare country lookup, e.g. `(ctx) => ctx.locals.runtime?.cf?.country` on Astro + Workers. */
  getCountry?: (context: I18nMiddlewareContext) => string | null | undefined;
}

const defaultExclude = (pathname: string) =>
  /\.[a-z0-9]+$/i.test(pathname) || pathname.startsWith('/_') || pathname.startsWith('/api/');

/**
 * Astro middleware implementing the network URL scheme: default locale at the
 * root, `/he` + `/ar` mirrors.
 *
 * - `?lang=<code>` on any URL is an explicit switch (the no-JS path used by
 *   LanguageSwitcher): sets the cookie and redirects to the localized
 *   equivalent without the param.
 * - Unprefixed pages redirect non-bot user agents to their detected locale
 *   (cookie > Accept-Language > CF country) when it isn't the default.
 * - Bots are never redirected and never get cookies — every URL serves its
 *   own locale, described to crawlers via hreflang tags.
 * - The `lang` cookie tracks the locale of the page served, so following a
 *   `/he/...` link updates the preference with no JS involved.
 */
export function createI18nMiddleware(options: I18nMiddlewareOptions = {}) {
  const locales = options.locales ?? ALL_LOCALES;
  const defaultLocale = options.defaultLocale ?? DEFAULT_LOCALE;
  const cookieName = options.cookieName ?? 'lang';
  const cookieMaxAge = options.cookieMaxAge ?? 60 * 60 * 24 * 365;
  const excludeRedirect = options.excludeRedirect ?? defaultExclude;
  const urlConfig = { locales, defaultLocale };

  return async (context: I18nMiddlewareContext, next: I18nMiddlewareNext): Promise<Response> => {
    const { request } = context;
    const url = context.url ?? new URL(request.url);
    // Secure only over https so plain-http localhost dev still gets the cookie.
    const secure = url.protocol === 'https:' ? '; Secure' : '';

    const withCookie = (response: Response, locale: string): Response => {
      response.headers.append(
        'set-cookie',
        `${cookieName}=${locale}; Path=/; Max-Age=${cookieMaxAge}; SameSite=Lax${secure}`,
      );
      return response;
    };
    const readable = request.method === 'GET' || request.method === 'HEAD';
    const bot = isBot(request.headers.get('user-agent'));
    const prefix = pathLocale(url.pathname, locales);
    const pageLocale = prefix ?? defaultLocale;

    const switched = url.searchParams.get(cookieName);
    if (switched && readable && !bot && (locales as readonly string[]).includes(switched)) {
      const target = new URL(url);
      target.searchParams.delete(cookieName);
      const path = localizePath(target.pathname, switched as LocaleCode, urlConfig);
      return withCookie(context.redirect(path + target.search, 302), switched);
    }

    if (!prefix && readable && !bot && !excludeRedirect(url.pathname)) {
      const { locale } = detectLocale(request, {
        ...urlConfig,
        cookieName,
        country: options.getCountry?.(context),
      });
      if (locale !== defaultLocale) {
        const path = localizePath(url.pathname, locale, urlConfig);
        return withCookie(context.redirect(path + url.search, 302), locale);
      }
    }

    context.locals.locale = pageLocale;
    context.locals.dir = localeDir(pageLocale);
    if (options.dictionaries) {
      context.locals.t = createTranslator(options.dictionaries, pageLocale);
    }

    const response = await next();
    // Cookie sync is limited to page navigations — excluded paths (feeds,
    // JSON data fetched from a page in another locale) must not clobber the
    // preference.
    if (
      readable &&
      !bot &&
      !excludeRedirect(url.pathname) &&
      getCookie(request, cookieName) !== pageLocale
    ) {
      try {
        withCookie(response, pageLocale);
      } catch {
        // Response with immutable headers (e.g. a raw Cache API hit) — skip.
      }
    }
    return response;
  };
}
