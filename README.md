# @webzai/site-i18n

Shared internationalization for the webzai-labs site network: **English (default, unprefixed), Hebrew (`/he/...`), Arabic (`/ar/...`)**.

The package holds *mechanism only* — locale registry, server-side detection, URL/hreflang helpers, dictionary lookup, an Astro middleware, and header components. Each site owns its own translation strings, exactly like the engine-package split in content-networks: never copy this code into a site.

## What every site gets

- **URL scheme** — default locale at the root, `/he` + `/ar` mirrors of every page.
- **Server-side detection** on first visit, precedence: `lang` cookie > URL prefix > `Accept-Language` (with q-values, `iw`→`he`) > Cloudflare country (`IL`→he; `SA AE EG JO MA DZ TN IQ KW QA BH OM LB LY YE SD SY PS`→ar) > `en`.
- **Redirects for humans only** — `/` and unprefixed pages 302 to the detected locale for non-bot user agents and set the `lang` cookie. Known crawlers (`isBot`) always get the URL as-is; the alternates are described via hreflang.
- **`?lang=<code>`** on any URL is an explicit switch (what the no-JS `LanguageSwitcher` links use for the unprefixed default locale): sets the cookie, 302s to the localized path without the param.
- **hreflang** — every page emits one `<link rel="alternate">` per locale plus `x-default`, and `he`/`ar` render with `<html lang="…" dir="rtl">` (direction comes from the registry).

## Install

Consumed as a git dependency — the package ships plain TypeScript source with an `exports` map (no build step, no dist). All network sites are Vite-based (Astro or Workers bundled by wrangler/esbuild), and both transpile `.ts` from `node_modules` transparently; committing `dist/` would just be a second copy to keep in sync. If a non-Vite consumer ever appears, add a `prepack` build then.

```jsonc
// package.json
"dependencies": {
  "@webzai/site-i18n": "github:webzai-labs/site-i18n"
}
```

The repo is private, so installs authenticate with your local git credentials (`gh auth` / SSH). CI that runs `pnpm install` on a consumer repo needs read access to this repo (e.g. a fine-grained PAT or deploy key) — the default per-repo `GITHUB_TOKEN` cannot see it.

Entry points:

```ts
import { detectLocale, isBot, localizePath, getAlternates, ... } from '@webzai/site-i18n';        // core, framework-free
import { createI18nMiddleware, type I18nLocals } from '@webzai/site-i18n/astro';                  // Astro middleware
import LanguageSwitcher from '@webzai/site-i18n/astro/LanguageSwitcher.astro';
import HreflangTags from '@webzai/site-i18n/astro/HreflangTags.astro';
```

## Dictionaries (site-owned strings)

```ts
import { getDictionary, type DictionarySet } from '@webzai/site-i18n';

const en = { searchTitle: 'Search routes', routesIn: 'Routes in {country}' };
export const dictionaries = {
  en,
  he: { searchTitle: 'חיפוש מסלולים', routesIn: 'מסלולים ב{country}' },
  ar: { searchTitle: 'البحث في المسارات' }, // missing keys fall back to en
} satisfies DictionarySet<typeof en>;

const strings = getDictionary(dictionaries, 'ar'); // property access, en-backfilled
// or: const t = createTranslator(dictionaries, 'he'); t('routesIn', { country: 'צרפת' })
```

Plain JSON files (`src/locales/he.json` etc.) imported into that object work the same way.

## Recipe (a): Astro SSR Worker site (content-networks style)

```ts
// src/middleware.ts
import { sequence } from 'astro:middleware';
import { createI18nMiddleware } from '@webzai/site-i18n/astro';
import { dictionaries } from './strings';

const i18n = createI18nMiddleware({
  locales: ['en', 'he', 'ar'],
  dictionaries,
  // Astro + @astrojs/cloudflare exposes request.cf here:
  getCountry: (ctx) => (ctx.locals as any).runtime?.cf?.country,
});

// i18n MUST run before any edge-cache middleware: redirects and cookie logic
// are per-visitor and must never be served from (or stored in) a shared cache.
export const onRequest = sequence(i18n, cacheMiddleware);
```

```ts
// src/env.d.ts
declare namespace App {
  interface Locals extends Runtime, import('@webzai/site-i18n/astro').I18nLocals {}
}
```

Every page/layout then reads `Astro.locals.locale` / `dir` / `t`, or keeps passing an explicit `locale` prop down a mirrored route tree (`src/pages/he/**`, `src/pages/ar/**`) — see `sites/waymark` for the reference integration.

```astro
---
import LanguageSwitcher from '@webzai/site-i18n/astro/LanguageSwitcher.astro';
import HreflangTags from '@webzai/site-i18n/astro/HreflangTags.astro';
---
<head>
  <HreflangTags siteUrl="https://example.com" alternates={perLocalePathsIfSlugsDiffer} />
</head>
<header>
  <LanguageSwitcher locale={locale} alternates={perLocalePathsIfSlugsDiffer} />
</header>
```

The switcher is a `<details>` dropdown (globe icon, each language in its own script), keyboard/ARIA-enhanced when JS is present but fully functional without it. Theme it via CSS custom properties (`--lang-switcher-bg`, `--lang-switcher-color`, `--lang-switcher-border`, `--lang-switcher-hover-bg`, `--lang-switcher-active-color`, `--lang-switcher-radius`).

## Recipe (b): static Astro on Cloudflare Pages (sparkfield style)

Static HTML can't detect anything at request time, so detection runs in a **Pages Function** (or the fronting router Worker — for the hearth cluster, hearth-router is the natural host). Build the site three times over (`/`, `/he`, `/ar` output trees, e.g. with three Astro builds or Astro's own i18n routing generating all trees), then:

```ts
// functions/_middleware.ts  (Cloudflare Pages Function, runs before static assets)
import { detectLocale, isBot, localizePath, pathLocale } from '@webzai/site-i18n';

const LOCALES = ['en', 'he', 'ar'] as const;

export const onRequest: PagesFunction = async ({ request, next }) => {
  const url = new URL(request.url);
  const bot = isBot(request.headers.get('user-agent'));
  const prefixed = pathLocale(url.pathname, LOCALES);
  const isPage = !/\.[a-z0-9]+$/i.test(url.pathname);

  if (!prefixed && !bot && isPage && request.method === 'GET') {
    const { locale } = detectLocale(request, {
      locales: LOCALES,
      country: (request as any).cf?.country,
    });
    if (locale !== 'en') {
      const res = Response.redirect(url.origin + localizePath(url.pathname, locale) + url.search, 302);
      const withCookie = new Response(null, res);
      withCookie.headers.append('set-cookie', `lang=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`);
      return withCookie;
    }
  }
  return next();
};
```

hreflang tags are static in this setup — emit them at build time with `getAlternates(path, siteUrl)` (or the `HreflangTags` component if the site is Astro).

## Recipe (c): plain Worker (kilnworks style, core only)

No Astro involved — use core inside `fetch`:

```ts
import { detectLocale, isBot, localizePath, pathLocale, getAlternates, getDictionary } from '@webzai/site-i18n';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const locale = pathLocale(url.pathname) ??
      (isBot(request.headers.get('user-agent'))
        ? 'en'
        : detectLocale(request, { country: (request as any).cf?.country }).locale);

    if (!pathLocale(url.pathname) && locale !== 'en') {
      return new Response(null, {
        status: 302,
        headers: {
          location: localizePath(url.pathname, locale) + url.search,
          'set-cookie': `lang=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`,
        },
      });
    }

    const strings = getDictionary(tenantDictionaries, locale);
    const hreflang = getAlternates(url.pathname, url.origin)
      .map((l) => `<link rel="alternate" hreflang="${l.hreflang}" href="${l.href}">`) 
      .join('');
    // render html with lang/dir from LOCALES[locale] ...
  },
};
```

## Development

```sh
pnpm install
pnpm test        # vitest: detection precedence, Accept-Language, bots, URLs, dictionaries, middleware
pnpm typecheck
```
