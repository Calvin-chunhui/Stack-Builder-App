import { describe, expect, it } from 'vitest';
import { cleanName, decodeStack, encodeStack, isDecodable, shareUrl } from '../encode';
import { emptyStack, withTool } from '../stack';
import type { Stack } from '../types';

const stack = (p: Partial<Stack>): Stack => ({ ...emptyStack(), ...p });

describe('encodeStack', () => {
  it('writes layers in fixed order, separated by ~', () => {
    const s = stack({
      frontend: 'nextjs',
      auth: 'betterauth',
      database: 'neon',
      hosting: 'vercel',
      devops: ['gha'],
      addons: ['drizzle', 'stripe'],
    });
    expect(encodeStack(s)).toBe('nextjs~~~betterauth~neon~vercel~gha~drizzle.stripe');
  });

  it('drops trailing empty groups to keep links short', () => {
    expect(encodeStack(stack({ frontend: 'react' }))).toBe('react');
    expect(encodeStack(stack({ frontend: 'react', backend: 'express' }))).toBe('react~~express');
  });

  it('encodes an empty stack as an empty string', () => {
    expect(encodeStack(emptyStack())).toBe('');
  });
});

describe('decodeStack', () => {
  it('reverses encodeStack', () => {
    const s = stack({
      frontend: 'nextjs',
      mobile: 'reactnative',
      backend: 'express',
      auth: 'clerk',
      database: 'postgres',
      hosting: 'railway',
      devops: ['gha', 'docker'],
      addons: ['prisma', 'tailwind'],
    });
    expect(decodeStack(encodeStack(s))).toEqual(s);
  });

  it('treats missing trailing groups as empty', () => {
    expect(decodeStack('react')).toEqual(stack({ frontend: 'react' }));
  });

  it('returns an empty stack for empty or null input', () => {
    expect(decodeStack('')).toEqual(emptyStack());
    expect(decodeStack(null)).toEqual(emptyStack());
    expect(decodeStack(undefined)).toEqual(emptyStack());
  });

  /* A shared link is untrusted input. These are the cases that matter. */
  it('skips ids that do not exist', () => {
    expect(decodeStack('notarealtool')).toEqual(emptyStack());
  });

  it('refuses a tool placed in the wrong layer', () => {
    // postgres is a database, so it must not be accepted as a frontend.
    expect(decodeStack('postgres')).toEqual(emptyStack());
    // ...but it is accepted in its own slot.
    expect(decodeStack('~~~~postgres')).toEqual(stack({ database: 'postgres' }));
  });

  it('keeps only the first pick in single-choice layers', () => {
    expect(decodeStack('react.vue')).toEqual(stack({ frontend: 'react' }));
  });

  it('de-duplicates multi-select layers', () => {
    expect(decodeStack('~~~~~~gha.gha.docker')).toEqual(stack({ devops: ['gha', 'docker'] }));
  });

  it('ignores stray separators and whitespace', () => {
    expect(decodeStack('  react  ~~~~~~')).toEqual(stack({ frontend: 'react' }));
  });

  it('survives far too many groups', () => {
    expect(decodeStack('react' + '~'.repeat(40))).toEqual(stack({ frontend: 'react' }));
  });
});

describe('isDecodable', () => {
  it('is true only when something real decodes', () => {
    expect(isDecodable('nextjs')).toBe(true);
    expect(isDecodable('nonsense')).toBe(false);
    expect(isDecodable('')).toBe(false);
    expect(isDecodable(null)).toBe(false);
  });
});

describe('shareUrl', () => {
  it('builds a /stack link carrying the encoded stack', () => {
    const s = withTool(emptyStack(), 'astro');
    const url = new URL(shareUrl(s, 'My site', 'https://example.com'));
    expect(url.pathname).toBe('/stack');
    expect(url.searchParams.get('s')).toBe('astro');
    expect(url.searchParams.get('n')).toBe('My site');
  });

  it('omits the default name', () => {
    const url = new URL(shareUrl(emptyStack(), 'Untitled stack', 'https://example.com'));
    expect(url.searchParams.has('n')).toBe(false);
  });
});

describe('cleanName', () => {
  it('collapses whitespace and caps the length', () => {
    expect(cleanName('  a   b  ')).toBe('a b');
    expect(cleanName('x'.repeat(200))).toHaveLength(60);
    expect(cleanName(null)).toBe('');
  });
});
