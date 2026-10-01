/**
 * Content Collections: where data quality gets enforced.
 *
 * Two things this buys us:
 *   1. A build that fails on bad data. A missing `lastVerified` or a malformed
 *      price stops the deploy rather than shipping a wrong number.
 *   2. A free audit trail. `git log src/content/tools/vercel.json` shows every
 *      price change with a date and an author. No database gives that for free.
 *
 * Verification dates are required, not optional, and they are surfaced in the
 * UI next to the figures they cover.
 */
import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
// Imported directly rather than re-exported from astro:content, which Astro 7
// deprecates. Pinned to the same major Astro uses so schemas stay compatible.
import { z } from 'zod';

const LAYER_IDS = [
  'frontend',
  'mobile',
  'backend',
  'auth',
  'database',
  'hosting',
  'devops',
  'addons',
] as const;

const layerId = z.enum(LAYER_IDS);

/** ISO calendar date, e.g. 2026-09-01. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date, e.g. 2026-09-01')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'must be a real date');

const pricing = z.object({
  /** Human-readable, shown on the tool page. */
  summary: z.string().min(1),
  /** Drives "can you start free?" in the report. */
  freeTier: z.boolean(),
  /** Typical entry plan per month; null means purely usage-based. */
  entryMonthly: z.number().nonnegative().nullable(),
  /** e.g. "2.9% + 30c per card charge". */
  usageFee: z.string().optional(),
  /** REQUIRED. Surfaced in the UI. */
  lastVerified: isoDate,
  /** The vendor page the figures came from. */
  sourceUrl: z.url(),
});

const tools = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/tools' }),
  schema: z
    .object({
      id: z.string().regex(/^[a-z0-9]+$/, 'ids are lowercase and alphanumeric'),
      name: z.string().min(1),
      /** Two-letter monogram for the tile, used when there is no logo. */
      monogram: z.string().min(1).max(3),
      layer: layerId,
      /** Add-ons only. */
      category: z.string().optional(),
      subtitle: z.string().min(1),
      tagline: z.string().min(1).max(40),
      firstRelease: z.number().int().min(1970).max(2100),
      creator: z.string().min(1),
      maintainer: z.string().min(1),
      version: z.object({ label: z.string().min(1), lastVerified: isoDate }),
      license: z.string().min(1),
      /** A graded enum, because the difficulty estimate is calibrated on it. */
      learningCurve: z.enum(['Easy', 'Easy to moderate', 'Moderate', 'Moderate to steep', 'Steep']),
      /** Editorial nuance the grade cannot carry, e.g. "for newcomers to functional code". */
      learningCurveNote: z.string().optional(),
      description: z.string().min(1),
      useCases: z.array(z.string()).min(2),
      /**
       * The prototype listed these as bare names. `sourceUrl` is optional
       * rather than invented: scripts/check-staleness.ts reports every
       * uncited entry so they can be backfilled from a citable source.
       */
      notableUsers: z
        .array(z.object({ name: z.string().min(1), sourceUrl: z.url().optional() }))
        .default([]),
      languages: z.object({ written: z.string().min(1), youWrite: z.string().min(1) }),
      concepts: z.array(z.object({ term: z.string().min(1), explanation: z.string().min(1) })).min(4),
      codeSamples: z
        .array(
          z.object({
            label: z.string().min(1),
            language: z.string().min(1),
            code: z.string().min(1),
          }),
        )
        .min(1),
      /** `resolved: false` means the name has no page of its own (e.g. "Vite"). */
      pairsWith: z.array(
        z.object({ toolId: z.string().min(1), reason: z.string().min(1), resolved: z.boolean() }),
      ),
      pros: z.array(z.string()).min(3),
      cons: z.array(z.string()).min(2),
      pricing,
      /** e.g. "Maintenance mode", "Owned by X". */
      flags: z.array(z.string()).default([]),
      links: z.object({ site: z.url(), docs: z.url() }),
      /** Only set where the vendor's brand page grants usage rights. */
      logo: z.string().optional(),
      surveys: z
        .object({
          /** Cite one respondent group consistently. */
          source: z.string().min(1),
          /** When the figure covers a narrower product than the record. */
          category: z.string().optional(),
          used: z.number().min(0).max(100).optional(),
          admired: z.number().min(0).max(100).optional(),
          satisfaction: z.number().min(0).max(100).optional(),
        })
        .optional(),
    })
    .strict()
    // An add-on without a category would fall out of the grouped library view.
    .refine((t) => t.layer !== 'addons' || Boolean(t.category), {
      message: 'add-ons must declare a category',
      path: ['category'],
    })
    .refine((t) => t.layer === 'addons' || !t.category, {
      message: 'only add-ons may declare a category',
      path: ['category'],
    })
    // Anything you cannot start free must say what it costs instead.
    .refine((t) => t.pricing.freeTier || (t.pricing.entryMonthly ?? 0) > 0 || Boolean(t.pricing.usageFee), {
      message: 'no free tier, so state an entryMonthly or a usageFee',
      path: ['pricing'],
    }),
});

const stackShape = z.object({
  frontend: z.string().nullable().default(null),
  mobile: z.string().nullable().default(null),
  backend: z.string().nullable().default(null),
  auth: z.string().nullable().default(null),
  database: z.string().nullable().default(null),
  hosting: z.string().nullable().default(null),
  devops: z.array(z.string()).default([]),
  addons: z.array(z.string()).default([]),
});

const recipes = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/recipes' }),
  schema: z
    .object({
      id: z.string().min(1),
      name: z.string().min(1),
      /** The headline tool list, e.g. "MongoDB, Express, React, Node". */
      parts: z.string().min(1),
      stack: stackShape,
      origin: z.string().min(1),
      goodFor: z.string().min(1),
      pros: z.array(z.string()).min(1),
      cons: z.array(z.string()).min(1),
    })
    .strict(),
});

const glossary = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/glossary' }),
  schema: z
    .object({
      id: z.string().min(1),
      term: z.string().min(1),
      /** Plain language. No jargon used to explain jargon. */
      definition: z.string().min(1),
      /** The everyday comparison. */
      like: z.string().nullable().default(null),
      layer: layerId.nullable().default(null),
    })
    .strict(),
});

const layers = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/layers' }),
  schema: z
    .object({
      id: layerId,
      name: z.string().min(1),
      title: z.string().min(1),
      blurb: z.string().min(1),
      order: z.number().int().min(0),
      optional: z.boolean().default(false),
      multi: z.boolean().default(false),
      /** CSS custom property holding the layer's accent colour. */
      color: z.string().startsWith('--'),
      /** Where it sits in the restaurant analogy. */
      place: z.string().min(1),
      analogy: z.string().min(1),
      zoneLabel: z.string().optional(),
      zoneText: z.string().optional(),
      points: z.array(z.string()).min(1),
      /** Key terms, each referencing a glossary entry. */
      terms: z.array(reference('glossary')).min(1),
      starters: z.array(z.object({ toolId: reference('tools'), why: z.string().min(1) })).min(1),
      flow: z.array(z.object({ step: z.string().min(1), detail: z.string().min(1) })).min(2),
    })
    .strict(),
});

export const collections = { tools, recipes, glossary, layers };
