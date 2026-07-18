import { describe, expect, it } from 'vitest';
import {
  detectLocale,
  isBot,
  localeFromCountry,
  parseAcceptLanguage,
  pickFromAcceptLanguage,
} from '../src/core/index';

const req = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, { headers });

describe('detectLocale precedence', () => {
  it('defaults to en with no signals', () => {
    expect(detectLocale(req('https://x.com/'))).toEqual({ locale: 'en', source: 'default' });
  });

  it('cookie beats everything else', () => {
    const r = req('https://x.com/he/trails', {
      cookie: 'a=1; lang=ar; b=2',
      'accept-language': 'he',
      'cf-ipcountry': 'IL',
    });
    expect(detectLocale(r)).toEqual({ locale: 'ar', source: 'cookie' });
  });

  it('ignores unsupported cookie values', () => {
    const r = req('https://x.com/', { cookie: 'lang=fr', 'accept-language': 'he' });
    expect(detectLocale(r)).toEqual({ locale: 'he', source: 'accept-language' });
  });

  it('URL prefix beats Accept-Language and country', () => {
    const r = req('https://x.com/he/trails', {
      'accept-language': 'ar',
      'cf-ipcountry': 'SA',
    });
    expect(detectLocale(r)).toEqual({ locale: 'he', source: 'path' });
  });

  it('Accept-Language beats country', () => {
    const r = req('https://x.com/', { 'accept-language': 'ar', 'cf-ipcountry': 'IL' });
    expect(detectLocale(r)).toEqual({ locale: 'ar', source: 'accept-language' });
  });

  it('an English browser in Israel stays English', () => {
    const r = req('https://x.com/', { 'accept-language': 'en-US,en;q=0.9', 'cf-ipcountry': 'IL' });
    expect(detectLocale(r)).toEqual({ locale: 'en', source: 'accept-language' });
  });

  it('falls back to CF country', () => {
    expect(detectLocale(req('https://x.com/', { 'cf-ipcountry': 'IL' }))).toEqual({
      locale: 'he',
      source: 'country',
    });
    expect(detectLocale(req('https://x.com/', { 'cf-ipcountry': 'EG' }))).toEqual({
      locale: 'ar',
      source: 'country',
    });
    expect(detectLocale(req('https://x.com/', { 'cf-ipcountry': 'FR' }))).toEqual({
      locale: 'en',
      source: 'default',
    });
  });

  it('uses an explicit country option over headers', () => {
    const r = req('https://x.com/', { 'cf-ipcountry': 'FR' });
    expect(detectLocale(r, { country: 'JO' })).toEqual({ locale: 'ar', source: 'country' });
  });

  it('respects a site locale subset', () => {
    const r = req('https://x.com/', { 'accept-language': 'ar', 'cf-ipcountry': 'SA' });
    expect(detectLocale(r, { locales: ['en', 'he'] })).toEqual({
      locale: 'en',
      source: 'default',
    });
  });
});

describe('parseAcceptLanguage', () => {
  it('parses q-values and sorts descending', () => {
    expect(parseAcceptLanguage('en;q=0.5,he;q=0.9,ar;q=0.7')).toEqual([
      { lang: 'he', q: 0.9 },
      { lang: 'ar', q: 0.7 },
      { lang: 'en', q: 0.5 },
    ]);
  });

  it('defaults q to 1 and drops wildcards and q=0', () => {
    expect(parseAcceptLanguage('he-IL, en;q=0, *;q=0.1')).toEqual([{ lang: 'he-il', q: 1 }]);
  });

  it('handles empty/absent headers', () => {
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage('')).toEqual([]);
  });
});

describe('pickFromAcceptLanguage', () => {
  it('matches region variants to base locales', () => {
    expect(pickFromAcceptLanguage('he-IL,he;q=0.9,en-US;q=0.8')).toBe('he');
    expect(pickFromAcceptLanguage('ar-EG,ar;q=0.9')).toBe('ar');
  });

  it('maps the legacy iw code to he', () => {
    expect(pickFromAcceptLanguage('iw-IL,iw;q=0.9')).toBe('he');
  });

  it('skips unsupported languages', () => {
    expect(pickFromAcceptLanguage('fr-FR,de;q=0.9')).toBeNull();
    expect(pickFromAcceptLanguage('fr-FR,ar;q=0.5')).toBe('ar');
  });
});

describe('localeFromCountry', () => {
  it('maps IL to he and the Arabic-speaking list to ar', () => {
    expect(localeFromCountry('IL')).toBe('he');
    for (const c of ['SA','AE','EG','JO','MA','DZ','TN','IQ','KW','QA','BH','OM','LB','LY','YE','SD','SY','PS']) {
      expect(localeFromCountry(c)).toBe('ar');
    }
    expect(localeFromCountry('US')).toBeNull();
    expect(localeFromCountry(undefined)).toBeNull();
  });
});

describe('isBot', () => {
  it('flags known crawlers and HTTP clients', () => {
    const bots = [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'facebookexternalhit/1.1',
      'Twitterbot/1.0',
      'Mozilla/5.0 (compatible; YandexBot/3.0)',
      'GPTBot/1.0',
      'curl/8.6.0',
      'Wget/1.21',
    ];
    for (const ua of bots) expect(isBot(ua), ua).toBe(true);
  });

  it('treats a missing UA as a bot', () => {
    expect(isBot(null)).toBe(true);
    expect(isBot('')).toBe(true);
  });

  it('passes real browsers', () => {
    const browsers = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
    ];
    for (const ua of browsers) expect(isBot(ua), ua).toBe(false);
  });
});
