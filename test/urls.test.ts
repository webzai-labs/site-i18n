import { describe, expect, it } from 'vitest';
import { delocalizePath, getAlternates, localizePath, pathLocale } from '../src/core/index';

describe('pathLocale', () => {
  it('reads a supported locale prefix', () => {
    expect(pathLocale('/he/trails')).toBe('he');
    expect(pathLocale('/ar')).toBe('ar');
    expect(pathLocale('/he')).toBe('he');
  });

  it('returns null for unprefixed or unsupported paths', () => {
    expect(pathLocale('/trails')).toBeNull();
    expect(pathLocale('/fr/trails')).toBeNull();
    expect(pathLocale('/hebrew/trails')).toBeNull();
    expect(pathLocale('/')).toBeNull();
  });

  it('respects a locale subset', () => {
    expect(pathLocale('/ar/x', ['en', 'he'])).toBeNull();
  });
});

describe('delocalizePath', () => {
  it('strips locale prefixes', () => {
    expect(delocalizePath('/he/trails/tour-du-mont-blanc')).toBe('/trails/tour-du-mont-blanc');
    expect(delocalizePath('/he')).toBe('/');
    expect(delocalizePath('/he/')).toBe('/');
  });

  it('leaves unprefixed paths alone', () => {
    expect(delocalizePath('/trails')).toBe('/trails');
    expect(delocalizePath('/')).toBe('/');
  });
});

describe('localizePath', () => {
  it('keeps the default locale at the root', () => {
    expect(localizePath('/trails', 'en')).toBe('/trails');
    expect(localizePath('/', 'en')).toBe('/');
  });

  it('prefixes non-default locales', () => {
    expect(localizePath('/trails', 'he')).toBe('/he/trails');
    expect(localizePath('/', 'ar')).toBe('/ar/');
  });

  it('is idempotent across locales', () => {
    expect(localizePath('/he/trails', 'ar')).toBe('/ar/trails');
    expect(localizePath('/ar/trails', 'en')).toBe('/trails');
    expect(localizePath('/he/trails', 'he')).toBe('/he/trails');
  });
});

describe('getAlternates', () => {
  it('emits one link per locale plus x-default at the default locale', () => {
    expect(getAlternates('/trails', 'https://waymarkroutes.com')).toEqual([
      { hreflang: 'en', href: 'https://waymarkroutes.com/trails' },
      { hreflang: 'he', href: 'https://waymarkroutes.com/he/trails' },
      { hreflang: 'ar', href: 'https://waymarkroutes.com/ar/trails' },
      { hreflang: 'x-default', href: 'https://waymarkroutes.com/trails' },
    ]);
  });

  it('normalizes a trailing slash on the site URL and localizes prefixed input', () => {
    const links = getAlternates('/he/trails', 'https://waymarkroutes.com/');
    expect(links[0]).toEqual({ hreflang: 'en', href: 'https://waymarkroutes.com/trails' });
  });

  it('honours per-locale slug overrides, including for x-default', () => {
    const links = getAlternates('/trails/west-highland-way', 'https://x.com', {
      alternates: { he: '/he/trails/west-highland-way-he' },
    });
    expect(links).toContainEqual({ hreflang: 'he', href: 'https://x.com/he/trails/west-highland-way-he' });
    expect(links).toContainEqual({ hreflang: 'ar', href: 'https://x.com/ar/trails/west-highland-way' });
    expect(links).toContainEqual({ hreflang: 'x-default', href: 'https://x.com/trails/west-highland-way' });
  });

  it('respects a locale subset', () => {
    const links = getAlternates('/x', 'https://x.com', { locales: ['en', 'he'] });
    expect(links.map((l) => l.hreflang)).toEqual(['en', 'he', 'x-default']);
  });
});
