/**
 * Data integrity. Astro's Zod schema already fails the build on a malformed
 * record; these tests cover the cross-file rules a per-file schema cannot see.
 */
import { describe, expect, it } from 'vitest';
import { TOOLS, hasTool, matches, tool } from '../catalog';
import { COMPAT } from '../compat.generated';
import { LAYERS, ADDON_CATS } from '../../data/taxonomy';
import { LAYER_ORDER } from '../stack';

interface RawTool {
  id: string;
  name: string;
  monogram: string;
  layer: string;
  category?: string;
  subtitle: string;
  tagline: string;
  learningCurve: string;
  learningCurveNote?: string;
  pricing: { freeTier: boolean; entryMonthly: number | null; lastVerified: string; sourceUrl: string };
  version: { label: string; lastVerified: string };
  concepts: { term: string; explanation: string }[];
  codeSamples: { label: string; language: string; code: string }[];
  pairsWith: { toolId: string; reason: string; resolved: boolean }[];
  useCases: string[];
  pros: string[];
  cons: string[];
  links: { site: string; docs: string };
  notableUsers: { name: string; sourceUrl?: string }[];
  surveys?: { source: string; used?: number; admired?: number; satisfaction?: number };
}

const raw = Object.values(
  import.meta.glob<RawTool>('../../content/tools/*.json', { eager: true, import: 'default' }),
);

interface Glossary {
  id: string;
  term: string;
  definition: string;
  like: string | null;
  layer: string | null;
}
const glossary = Object.values(
  import.meta.glob<Glossary>('../../content/glossary/*.json', { eager: true, import: 'default' }),
);

describe('catalogue', () => {
  it('loads 100 tools', () => {
    expect(raw).toHaveLength(100);
    expect(TOOLS).toHaveLength(100);
  });

  it('loads 80 glossary terms', () => {
    expect(glossary).toHaveLength(80);
  });

  it('has a unique id per tool', () => {
    const ids = raw.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('places every tool in a real layer', () => {
    const layers = new Set(LAYERS.map((l) => l.id));
    for (const t of raw) expect(layers.has(t.layer as never), `${t.id} -> ${t.layer}`).toBe(true);
  });

  it('gives every add-on a real category, and no other tool one', () => {
    const cats = new Set(ADDON_CATS.map((c) => c.id));
    for (const t of raw) {
      if (t.layer === 'addons') {
        expect(t.category, `${t.id} has no category`).toBeDefined();
        expect(cats.has(t.category!), `${t.id} -> ${t.category}`).toBe(true);
      } else {
        expect(t.category, `${t.id} should not have a category`).toBeUndefined();
      }
    }
  });

  it('fills every layer with at least one tool', () => {
    for (const layer of LAYER_ORDER) {
      expect(raw.filter((t) => t.layer === layer).length, `${layer} is empty`).toBeGreaterThan(0);
    }
  });
});

describe('engine coverage', () => {
  it('has compatibility attributes for every tool', () => {
    for (const t of raw) expect(COMPAT[t.id], `${t.id} has no COMPAT entry`).toBeDefined();
  });

  it('has no orphaned compatibility entries', () => {
    for (const id of Object.keys(COMPAT)) expect(hasTool(id), `COMPAT.${id} has no tool`).toBe(true);
  });

  it('no longer carries pricing in COMPAT, which lives with the tool record', () => {
    for (const [id, attrs] of Object.entries(COMPAT)) {
      expect(attrs, `COMPAT.${id}`).not.toHaveProperty('$');
      expect(attrs, `COMPAT.${id}`).not.toHaveProperty('fee');
    }
  });
});

describe('schema constraints the build plan requires', () => {
  it('keeps every tagline within 40 characters', () => {
    for (const t of raw) expect(t.tagline.length, `${t.id}: "${t.tagline}"`).toBeLessThanOrEqual(40);
  });

  it('gives every record the minimum content', () => {
    for (const t of raw) {
      expect(t.useCases.length, `${t.id} useCases`).toBeGreaterThanOrEqual(2);
      expect(t.concepts.length, `${t.id} concepts`).toBeGreaterThanOrEqual(4);
      expect(t.pros.length, `${t.id} pros`).toBeGreaterThanOrEqual(3);
      expect(t.cons.length, `${t.id} cons`).toBeGreaterThanOrEqual(2);
      expect(t.codeSamples.length, `${t.id} codeSamples`).toBeGreaterThanOrEqual(1);
    }
  });

  /* The plan makes verification dates required, not optional. */
  it('requires a verification date on every price and version', () => {
    const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    for (const t of raw) {
      expect(isDate(t.pricing.lastVerified), `${t.id} pricing.lastVerified`).toBe(true);
      expect(isDate(t.version.lastVerified), `${t.id} version.lastVerified`).toBe(true);
    }
  });

  it('cites a source for every price', () => {
    for (const t of raw) expect(() => new URL(t.pricing.sourceUrl), `${t.id}`).not.toThrow();
  });

  it('uses valid URLs for every official link', () => {
    for (const t of raw) {
      expect(() => new URL(t.links.site), `${t.id} site`).not.toThrow();
      expect(() => new URL(t.links.docs), `${t.id} docs`).not.toThrow();
    }
  });

  it('never leaves a code sample empty or HTML-escaped', () => {
    for (const t of raw) {
      for (const c of t.codeSamples) {
        expect(c.code.trim().length, `${t.id}: empty sample`).toBeGreaterThan(0);
        expect(c.code, `${t.id}: sample still escaped`).not.toMatch(/&lt;|&gt;|&amp;/);
        expect(c.label.length, `${t.id}: sample has no label`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps pricing internally consistent', () => {
    for (const t of raw) {
      if (t.pricing.freeTier) continue;
      // A tool you cannot start free must explain what it costs instead: either
      // a monthly entry price, or a usage fee (AI models bill per token, so
      // they genuinely have no monthly figure).
      const hasEntry = t.pricing.entryMonthly !== null && t.pricing.entryMonthly > 0;
      const hasUsageFee = Boolean((t.pricing as { usageFee?: string }).usageFee);
      expect(
        hasEntry || hasUsageFee,
        `${t.id} has no free tier but states neither an entry price nor a usage fee`,
      ).toBe(true);
    }
  });

  it('never states a negative price', () => {
    for (const t of raw) {
      if (t.pricing.entryMonthly === null) continue;
      expect(t.pricing.entryMonthly, `${t.id}`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('cross-references', () => {
  it('resolves pairsWith entries, or marks them unresolved on purpose', () => {
    for (const t of raw) {
      for (const p of t.pairsWith) {
        expect(p.resolved, `${t.id} -> ${p.toolId}`).toBe(hasTool(p.toolId));
        expect(p.reason.length, `${t.id} -> ${p.toolId} has no reason`).toBeGreaterThan(0);
      }
    }
  });

  it('never points a tool at itself', () => {
    for (const t of raw) {
      for (const p of t.pairsWith) expect(p.toolId, `${t.id} pairs with itself`).not.toBe(t.id);
    }
  });

  it('gives every glossary term a unique id and a definition', () => {
    const ids = glossary.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of glossary) {
      expect(g.term.length, `${g.id} has no term`).toBeGreaterThan(0);
      expect(g.definition.length, `${g.id} has no definition`).toBeGreaterThan(0);
    }
  });

  it('attaches glossary terms only to real layers', () => {
    const layers = new Set(LAYERS.map((l) => l.id));
    for (const g of glossary) {
      if (g.layer) expect(layers.has(g.layer as never), `${g.id} -> ${g.layer}`).toBe(true);
    }
  });

  it('cites a survey source wherever it quotes a figure', () => {
    for (const t of raw) {
      if (!t.surveys) continue;
      expect(t.surveys.source.length, `${t.id} quotes a survey with no source`).toBeGreaterThan(0);
      for (const k of ['used', 'admired', 'satisfaction'] as const) {
        const v = t.surveys[k];
        if (v === undefined) continue;
        expect(v, `${t.id} surveys.${k}`).toBeGreaterThanOrEqual(0);
        expect(v, `${t.id} surveys.${k}`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('exposes popularity to the engine wherever a survey figure exists', () => {
    for (const t of raw) {
      const expected = t.surveys?.used ?? 0;
      expect(tool(t.id)?.popularity, `${t.id}`).toBe(expected);
    }
  });
});

/**
 * The compact catalogue is generated so the browser bundle does not carry
 * every description and code sample. That is only safe if it cannot drift from
 * the content files, which is what this block guarantees. If it fails, rerun
 * `npm run extract`.
 */
describe('generated catalogue matches the content files', () => {
  it('covers exactly the same tools', () => {
    expect(TOOLS.map((t) => t.id).sort()).toEqual(raw.map((t) => t.id).sort());
  });

  it('copies every mirrored field verbatim', () => {
    for (const r of raw) {
      const c = tool(r.id);
      expect(c, `${r.id} missing from the generated catalogue`).toBeDefined();
      expect(c!.name, `${r.id}.name`).toBe(r.name);
      expect(c!.monogram, `${r.id}.monogram`).toBe(r.monogram);
      expect(c!.layer, `${r.id}.layer`).toBe(r.layer);
      expect(c!.category, `${r.id}.category`).toBe(r.category);
      expect(c!.subtitle, `${r.id}.subtitle`).toBe(r.subtitle);
      expect(c!.tagline, `${r.id}.tagline`).toBe(r.tagline);
      expect(c!.learningCurve, `${r.id}.learningCurve`).toBe(r.learningCurve);
      expect(c!.pricing.freeTier, `${r.id}.pricing.freeTier`).toBe(r.pricing.freeTier);
      expect(c!.pricing.entryMonthly, `${r.id}.pricing.entryMonthly`).toBe(r.pricing.entryMonthly);
      expect(c!.pricing.usageFee, `${r.id}.pricing.usageFee`).toBe(
        (r.pricing as { usageFee?: string }).usageFee,
      );
    }
  });

  it('builds a search haystack covering name, tagline and use cases', () => {
    for (const r of raw) {
      const hay = tool(r.id)!.haystack;
      expect(hay, `${r.id} haystack is not lowercase`).toBe(hay.toLowerCase());
      expect(hay, `${r.id} haystack misses the name`).toContain(r.name.toLowerCase());
      expect(hay, `${r.id} haystack misses the tagline`).toContain(r.tagline.toLowerCase());
      for (const u of r.useCases) {
        expect(hay, `${r.id} haystack misses use case "${u}"`).toContain(u.toLowerCase());
      }
    }
  });
});

describe('search', () => {
  it('matches on a language, not just a name', () => {
    const hits = TOOLS.filter((t) => matches(t, 'python'));
    expect(hits.map((t) => t.id)).toContain('django');
    expect(hits.map((t) => t.id)).toContain('fastapi');
  });

  it('narrows as words are added', () => {
    const broad = TOOLS.filter((t) => matches(t, 'python')).length;
    const narrow = TOOLS.filter((t) => matches(t, 'python api')).length;
    expect(narrow).toBeGreaterThan(0);
    expect(narrow).toBeLessThan(broad);
  });

  it('matches on the job rather than the product name', () => {
    expect(TOOLS.filter((t) => matches(t, 'payments')).map((t) => t.id)).toContain('stripe');
  });

  it('returns everything for an empty query', () => {
    expect(TOOLS.filter((t) => matches(t, '   ')).length).toBe(TOOLS.length);
  });

  it('is case-insensitive', () => {
    expect(TOOLS.filter((t) => matches(t, 'PostgreSQL')).map((t) => t.id)).toContain('postgres');
  });
});
