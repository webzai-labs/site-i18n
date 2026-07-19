import { describe, expect, it } from 'vitest';
import { createI18nMiddleware, type I18nMiddlewareContext } from '../src/astro/index';

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

function makeContext(url: string, headers: Record<string, string> = {}) {
  const request = new Request(url, { headers });
  const context: I18nMiddlewareContext = {
    request,
    url: new URL(url),
    locals: {},
    redirect: (path, status = 302) =>
      new Response(null, { status, headers: { location: path } }),
  };
  return context;
}

const next = async () => new Response('<html></html>', { status: 200 });

describe('createI18nMiddleware', () => {
  const middleware = createI18nMiddleware({
    dictionaries: { en: { hi: 'Hi' }, he: { hi: 'שלום' } },
  });

  it('redirects a Hebrew browser from / to /he/ and sets the cookie', async () => {
    const res = await middleware(
      makeContext('https://x.com/', { 'user-agent': CHROME, 'accept-language': 'he-IL,he;q=0.9' }),
      next,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/he/');
    expect(res.headers.get('set-cookie')).toContain('lang=he');
  });

  it('marks cookies Secure over https but not over plain-http dev', async () => {
    const https = await middleware(
      makeContext('https://x.com/', { 'user-agent': CHROME, 'accept-language': 'he' }),
      next,
    );
    expect(https.headers.get('set-cookie')).toContain('; Secure');
    const http = await middleware(
      makeContext('http://localhost:4321/', { 'user-agent': CHROME, 'accept-language': 'he' }),
      next,
    );
    expect(http.headers.get('set-cookie')).toContain('lang=he');
    expect(http.headers.get('set-cookie')).not.toContain('Secure');
  });

  it('redirects unprefixed inner pages using the cookie', async () => {
    const res = await middleware(
      makeContext('https://x.com/trails/tour-du-mont-blanc?x=1', {
        'user-agent': CHROME,
        cookie: 'lang=ar',
      }),
      next,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/ar/trails/tour-du-mont-blanc?x=1');
  });

  it('serves / as English when detection lands on the default', async () => {
    const ctx = makeContext('https://x.com/', { 'user-agent': CHROME, 'cf-ipcountry': 'US' });
    const res = await middleware(ctx, next);
    expect(res.status).toBe(200);
    expect(ctx.locals.locale).toBe('en');
    expect(res.headers.get('set-cookie')).toContain('lang=en');
  });

  it('never redirects bots and never sets cookies for them', async () => {
    const ctx = makeContext('https://x.com/', {
      'user-agent': GOOGLEBOT,
      'accept-language': 'he',
      'cf-ipcountry': 'IL',
    });
    const res = await middleware(ctx, next);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(ctx.locals.locale).toBe('en');
  });

  it('serves prefixed pages as-is and syncs the cookie to the page locale', async () => {
    const ctx = makeContext('https://x.com/he/trails', { 'user-agent': CHROME, cookie: 'lang=en' });
    const res = await middleware(ctx, next);
    expect(res.status).toBe(200);
    expect(ctx.locals.locale).toBe('he');
    expect(ctx.locals.dir).toBe('rtl');
    expect((ctx.locals.t as (k: string) => string)('hi')).toBe('שלום');
    expect(res.headers.get('set-cookie')).toContain('lang=he');
  });

  it('treats ?lang= as an explicit switch that beats the cookie', async () => {
    const res = await middleware(
      makeContext('https://x.com/he/trails?lang=en', { 'user-agent': CHROME, cookie: 'lang=he' }),
      next,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/trails');
    expect(res.headers.get('set-cookie')).toContain('lang=en');
  });

  it('does not redirect asset-like or API paths', async () => {
    for (const path of ['/sitemap.xml', '/search-index.json', '/_image', '/api/health']) {
      const res = await middleware(
        makeContext(`https://x.com${path}`, { 'user-agent': CHROME, cookie: 'lang=he' }),
        next,
      );
      expect(res.status, path).toBe(200);
      expect(res.headers.get('set-cookie'), path).toBeNull();
    }
  });
});
