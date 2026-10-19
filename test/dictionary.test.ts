import { describe, expect, it } from 'vitest';
import {
  createTranslator,
  getDictionary,
  interpolate,
  translate,
  type DictionarySet,
} from '../src/core/index';

const dicts = {
  en: { hello: 'Hello', greet: 'Hi {name}, you have {count} routes', onlyEn: 'English only' },
  he: { hello: 'שלום', greet: 'היי {name}, יש לך {count} מסלולים' },
  ar: { hello: 'مرحبا' },
} satisfies DictionarySet<{ hello: string; greet: string; onlyEn: string }>;

describe('interpolate', () => {
  it('substitutes {param} placeholders', () => {
    expect(interpolate('Hi {name}!', { name: 'Amir' })).toBe('Hi Amir!');
    expect(interpolate('{a}{b}', { a: 1, b: 2 })).toBe('12');
  });

  it('leaves unknown placeholders intact', () => {
    expect(interpolate('Hi {name}', {})).toBe('Hi {name}');
    expect(interpolate('Hi {name}')).toBe('Hi {name}');
  });

  it('returns a non-string entry unchanged instead of calling replace', () => {
    const forms = { one: '1 hour', other: '{count} hours' };
    expect(interpolate(forms as unknown as string, { count: 2 })).toBe(forms);
  });
});

describe('translate', () => {
  it('returns the localized string', () => {
    expect(translate(dicts, 'he', 'hello')).toBe('שלום');
    expect(translate(dicts, 'ar', 'hello')).toBe('مرحبا');
  });

  it('falls back to English key-by-key', () => {
    expect(translate(dicts, 'ar', 'greet', { name: 'Amir', count: 3 })).toBe(
      'Hi Amir, you have 3 routes',
    );
    expect(translate(dicts, 'he', 'onlyEn')).toBe('English only');
  });

  it('returns a plural object instead of throwing', () => {
    const forms = { one: '1 hour', other: '{count} hours' };
    const plural = { en: { hours: forms } } as unknown as DictionarySet;
    expect(translate(plural, 'en', 'hours', { count: 2 })).toBe(forms);
    expect(createTranslator(plural, 'en')('hours')).toBe(forms);
  });

  it('interpolates localized strings', () => {
    expect(translate(dicts, 'he', 'greet', { name: 'עמיר', count: 2 })).toBe(
      'היי עמיר, יש לך 2 מסלולים',
    );
  });
});

describe('createTranslator', () => {
  it('binds locale and dictionaries', () => {
    const t = createTranslator(dicts, 'he');
    expect(t('hello')).toBe('שלום');
    expect(t('greet', { name: 'X', count: 1 })).toBe('היי X, יש לך 1 מסלולים');
  });
});

describe('getDictionary', () => {
  it('merges English fallbacks into partial locales', () => {
    const ar = getDictionary(dicts, 'ar');
    expect(ar.hello).toBe('مرحبا');
    expect(ar.onlyEn).toBe('English only');
  });

  it('returns the English table untouched for en', () => {
    expect(getDictionary(dicts, 'en')).toBe(dicts.en);
  });
});
