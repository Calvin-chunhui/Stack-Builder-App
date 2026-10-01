/**
 * Glossary lookup and the automatic term linking used across the site.
 *
 * Loaded with `import.meta.glob` (like the engine catalogue) so `linkTerms`
 * stays a pure function callable from any Astro component without awaiting
 * getCollection in every template.
 */
import type { LayerId } from '../engine/types';

export interface Term {
  id: string;
  term: string;
  definition: string;
  like: string | null;
  layer: LayerId | null;
}

export const TERMS: Term[] = Object.values(
  import.meta.glob<Term>('../content/glossary/*.json', { eager: true, import: 'default' }),
).sort((a, b) => a.term.localeCompare(b.term));

const index = new Map(TERMS.map((t) => [t.id, t]));

export const termById = (id: string): Term | undefined => index.get(id);

/**
 * Terms whose plain English is too common to auto-link. "Frontend" appears in
 * almost every sentence on the site; linking it everywhere would be noise.
 */
const SKIP_LINK = new Set(['frontend-term', 'backend-term', 'database-term', 'hosting-term', 'tech-stack']);

/** Extra spellings and plurals that should match a term. */
const EXTRA_ALIASES: Record<string, string[]> = {
  jwt: ['JWT'],
  queue: ['background job', 'background jobs', 'queue'],
  repository: ['repository', 'repo'],
  mfa: ['two-factor', 'MFA'],
  http: ['HTTPS', 'HTTP'],
  api: ['API', 'APIs'],
  'api-key': ['API key', 'API keys', 'secret key', 'secret keys'],
  orm: ['ORM', 'ORMs'],
  sdk: ['SDK', 'SDKs'],
  cdn: ['CDN'],
  component: ['component', 'components'],
  container: ['container', 'containers'],
  endpoint: ['endpoint', 'endpoints'],
  webhook: ['webhook', 'webhooks'],
  migration: ['migration', 'migrations'],
  'environment-variable': ['environment variable', 'environment variables'],
  'cold-start': ['cold start', 'cold starts'],
  serverless: ['serverless'],
  'free-tier': ['free tier', 'free tiers'],
  iac: ['infrastructure as code'],
  ci: ['CI'],
  cd: ['CD'],
};

/** Longest names first, so "API key" wins over "API". */
const MATCHERS = TERMS.filter((t) => !SKIP_LINK.has(t.id))
  .flatMap((t) => {
    let names = EXTRA_ALIASES[t.id];
    if (!names) {
      const base = t.term.replace(/\s*\(.*\)\s*/, '').trim();
      const paren = t.term.match(/\(([^)]+)\)/)?.[1];
      names = [base];
      // Also match a parenthesised acronym, e.g. "Single sign-on (SSO)".
      if (paren && /^[A-Z]{2,5}$/.test(paren)) names.push(paren);
    }
    return names.map((n) => ({ id: t.id, n }));
  })
  .sort((a, b) => b.n.length - a.n.length);

export const escapeHtml = (s: unknown): string =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/**
 * Wraps the first occurrence of up to `max` glossary terms in a popover
 * trigger. Each term is linked at most once per block of text.
 *
 * Matches are substituted for placeholders first, so an already-linked word
 * can never be matched again by a later, shorter term.
 */
export function linkTerms(text: string, max = 5): string {
  let out = escapeHtml(text);
  const found: { id: string; word: string }[] = [];
  const used = new Set<string>();

  for (const m of MATCHERS) {
    if (found.length >= max) break;
    if (used.has(m.id)) continue;

    const pattern = m.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // An all-caps name like "API" must not match "api" inside another word.
    const caseSensitive = /^[A-Z]{2,}s?$/.test(m.n);
    const re = new RegExp(`(^|[^\\w\\u0001-])(${pattern})(?![\\w-])`, caseSensitive ? '' : 'i');

    const hit = out.match(re);
    if (!hit) continue;

    out = out.replace(re, (_all, pre: string) => `${pre}\u0001${found.length}\u0002`);
    found.push({ id: m.id, word: hit[2]! });
    used.add(m.id);
  }

  return out.replace(
    /\u0001(\d+)\u0002/g,
    (_, i: string) =>
      `<button class="term" data-term="${found[Number(i)]!.id}">${found[Number(i)]!.word}</button>`,
  );
}

/** A chip that opens a term's definition. */
export function termChip(id: string): string {
  const t = index.get(id);
  if (!t) return '';
  return `<button class="chip" data-term="${id}">${escapeHtml(t.term)}</button>`;
}

/** Groups terms by first letter for the glossary index. */
export function groupByLetter(terms: Term[]): [string, Term[]][] {
  const letters = new Map<string, Term[]>();
  for (const t of terms) {
    const l = t.term[0]!.toUpperCase();
    if (!letters.has(l)) letters.set(l, []);
    letters.get(l)!.push(t);
  }
  return [...letters.entries()].sort(([a], [b]) => a.localeCompare(b));
}
