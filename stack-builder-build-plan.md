# Stack Builder: build plan

A plan for turning the single-file prototype into a real application.

**Recommended stack:** Astro 6 + a React island for the builder + TypeScript + Tailwind CSS, content in Astro Content Collections, deployed to Vercel. No backend and no database to start.

---

## Why this stack

| Requirement | What it needs | Decision |
|---|---|---|
| ~200 content pages that are the same for everyone | Static HTML, fast, indexable | Astro, zero JS by default |
| One interactive builder | A client-side app on a single page | React island with `client:load` |
| Feasibility engine | A pure function over a small fixed dataset | Plain TypeScript module, runs in the browser |
| 100 tool records with prices and versions | Validated, reviewable, with change history | Content Collections + Zod in the repo |
| Shareable stacks | A link someone can send | Encode the stack in the URL |
| A person's own saved stacks | Persistence on their device | `localStorage` |
| Search across tools and terms | Instant, no service to run | Pagefind (static index) |

No part of the current feature set requires a server, a database, or a secret key. That is the whole reason this works as a pure frontend.

### Astro vs Next.js

Astro wins here because search is the growth channel and most of the site is text. Content pages ship as HTML with no framework runtime; only the builder hydrates.

**Switch to Next.js if** accounts become central to the product rather than optional: user dashboards, a community gallery as the main draw, or anything where most pages are personalised. One framework handling sessions and server rendering is then worth the extra JavaScript on content pages.

### Hosting

Either Vercel or Cloudflare Workers; Astro has official adapters for both.

- **Vercel** — simplest path, best preview deployments, built-in OG image generation.
- **Cloudflare** — cheaper at high traffic, no egress fees, first-class Astro support since Astro 6.

Start on Vercel. Moving later is an adapter change, not a rewrite.

---

## Project structure

```
stack-builder/
├─ src/
│  ├─ content/
│  │  ├─ config.ts              # Zod schemas for every collection
│  │  ├─ tools/                 # 100 files, one per tool
│  │  │  ├─ nextjs.json
│  │  │  └─ postgres.json
│  │  ├─ layers/                # 8 layer hub introductions (MDX)
│  │  ├─ glossary/              # 80 terms
│  │  └─ recipes/               # 13 stack presets
│  │
│  ├─ engine/                   # The product's brain. No framework imports.
│  │  ├─ compat.ts              # Compatibility attributes per tool
│  │  ├─ rules.ts               # Each rule as a named, testable function
│  │  ├─ assess.ts              # Runs rules, returns verdict + findings
│  │  ├─ suggest.ts             # Fix suggestions (swap / remove)
│  │  ├─ summarize.ts           # Languages, difficulty, cost
│  │  ├─ encode.ts              # Stack <-> URL string
│  │  └─ __tests__/             # Vitest: one file per concern
│  │
│  ├─ components/
│  │  ├─ builder/               # React island
│  │  │  ├─ Builder.tsx
│  │  │  ├─ LayerPicker.tsx
│  │  │  ├─ StrataDiagram.tsx
│  │  │  ├─ VerdictCard.tsx
│  │  │  └─ store.ts            # Zustand or useReducer
│  │  ├─ learn/                 # Astro components: floor plan, journey
│  │  ├─ TermLink.astro         # Glossary popover trigger
│  │  └─ FlowDiagram.astro
│  │
│  ├─ layouts/
│  └─ pages/
│     ├─ index.astro            # Learn
│     ├─ builder.astro          # Hosts the React island
│     ├─ stack.astro            # Shared stack from ?s= param
│     ├─ library/
│     │  ├─ index.astro
│     │  ├─ [layer].astro       # 8 hub pages
│     │  └─ tool/[id].astro     # 100 tool pages, statically generated
│     ├─ glossary.astro
│     ├─ recipes/[id].astro
│     └─ api/og.ts              # Dynamic OG images (the one serverless function)
│
├─ scripts/
│  └─ check-staleness.ts        # Flags records past lastVerified + 90 days
└─ .github/workflows/
   ├─ ci.yml                    # Typecheck, lint, test, build
   └─ staleness.yml             # Monthly: opens an issue listing stale records
```

---

## Content schema

The schema is where data quality gets enforced. Make verification dates required, not optional.

```ts
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const pricing = z.object({
  summary: z.string(),              // Human-readable, shown on the page
  freeTier: z.boolean(),            // Drives "can you start free?"
  entryMonthly: z.number().nullable(), // null = purely usage-based
  usageFee: z.string().optional(),  // e.g. "2.9% + 30c per card charge"
  lastVerified: z.string().date(),  // REQUIRED. Surfaced in the UI.
  sourceUrl: z.string().url(),      // The vendor page it came from
});

const tools = defineCollection({
  type: 'data',
  schema: z.object({
    id: z.string(),
    name: z.string(),
    layer: z.enum(['frontend','mobile','backend','auth','database','hosting','devops','addons']),
    category: z.string().optional(),     // Add-ons only
    subtitle: z.string(),
    tagline: z.string().max(40),
    firstRelease: z.number().int(),
    creator: z.string(),
    maintainer: z.string(),
    version: z.object({ label: z.string(), lastVerified: z.string().date() }),
    license: z.string(),
    learningCurve: z.enum(['Easy','Easy to moderate','Moderate','Moderate to steep','Steep']),
    description: z.string(),
    useCases: z.array(z.string()).min(2),
    notableUsers: z.array(z.object({
      name: z.string(),
      sourceUrl: z.string().url(),       // Only list users you can cite
    })).default([]),
    languages: z.object({ written: z.string(), youWrite: z.string() }),
    concepts: z.array(z.object({ term: z.string(), explanation: z.string() })).min(4),
    codeSamples: z.array(z.object({ label: z.string(), language: z.string(), code: z.string() })).min(1),
    pairsWith: z.array(z.object({ toolId: z.string(), reason: z.string() })),
    pros: z.array(z.string()).min(3),
    cons: z.array(z.string()).min(2),
    pricing,
    flags: z.array(z.string()).default([]),   // "Maintenance mode", "Owned by X"
    links: z.object({ site: z.string().url(), docs: z.string().url() }),
    logo: z.string().optional(),              // Only if you have usage rights
    surveys: z.object({
      source: z.string(),                     // "Stack Overflow 2025, all respondents"
      used: z.number().optional(),
      admired: z.number().optional(),
      satisfaction: z.number().optional(),
    }).optional(),
  }),
});

export const collections = { tools, /* layers, glossary, recipes */ };
```

Two things this buys you:

1. **A build that fails on bad data.** A missing `lastVerified` or an unciteable logo stops the deploy.
2. **A free audit trail.** `git log src/content/tools/vercel.json` shows every price change with a date and author. No database gives you that for free.

---

## The engine

Keep it framework-free and test it properly. These rules *are* the product.

```ts
// src/engine/rules.ts — each rule is small, named and independently testable
export const rules: Rule[] = [
  {
    id: 'auth-library-needs-js-server',
    group: 'auth',
    check: (s, ctx) => {
      const auth = ctx.compat(s.auth);
      if (auth?.kind !== 'library' || ctx.serverLanguage === 'js') return null;
      return {
        severity: 'block',
        message: `${ctx.name(s.auth)} runs inside a JavaScript or TypeScript server.`,
        fix: { layer: 'auth', alsoRemove: s.auth },
      };
    },
  },
  // ...
];
```

```ts
// src/engine/__tests__/presets.test.ts
import { describe, it, expect } from 'vitest';
import { assess } from '../assess';
import { recipes } from '../../content/recipes';

describe('every shipped recipe is feasible', () => {
  for (const r of recipes) {
    it(`${r.name} has no blockers`, () => {
      expect(assess(r.stack).blockers).toHaveLength(0);
    });
  }
});
```

That second test is the one that saves you. Add a rule six months from now and you'll immediately know if it broke a recipe you advertise on the home page.

---

## Shareable stacks without a backend

```ts
// src/engine/encode.ts
// Layers in fixed order, groups separated by ~, multi-select joined by .
// e.g. nextjs.betterauth.neon.vercel~gha~drizzle.stripe
export function encodeStack(s: Stack): string { /* ... */ }
export function decodeStack(q: string): Stack { /* ... */ }
```

- `/stack?s=...` renders a read-only view of any stack with its full report
- A "Copy link" button in the builder produces that URL
- `/api/og.ts` generates a preview image showing the stack and verdict, so shared links look like a product rather than a bare URL

This is the single highest-leverage feature for growth, and it needs no storage.

---

## Build order

| Phase | Work | Outcome |
|---|---|---|
| 1 | Scaffold Astro, port the 100 tool records into Content Collections with the schema, generate the tool and hub pages | The reference library is live and indexable |
| 2 | Extract the engine into `src/engine`, write tests for every rule and preset | The logic is trustworthy and separable |
| 3 | Build the builder as a React island, wire URL encoding and `localStorage` | Feature parity with the prototype |
| 4 | Port the Learn page: floor plan, order journey, glossary popovers | The beginner path works |
| 5 | Pagefind search, OG images, staleness workflow, analytics | Production-ready |

Phases 1 and 2 are worth doing in that order: getting the data into a validated shape first makes everything after it easier.

---

## When to add a backend

Add one when you want a specific thing it alone can do:

| Trigger | What to add |
|---|---|
| Saved stacks syncing across devices | Postgres (Neon or Supabase) + Better Auth or Clerk |
| A public gallery of community stacks | The same, plus moderation |
| Non-technical editors updating tool data | A headless CMS (Sanity) or an admin route behind auth |
| Per-stack analytics or comparison data | PostHog first; a database only if you outgrow it |

Until one of those is actually true, a database adds backup, migration, connection and cost concerns while solving nothing. The URL-encoding approach covers sharing, which is the thing people usually build accounts for.

---

## Notes and caveats

- **Logos:** keep the monogram tiles as the default. Only add a logo file where the vendor's brand page grants usage rights; the schema's `logo` field is optional for exactly this reason.
- **Survey figures:** cite one respondent group consistently. The Stack Overflow 2026 survey opened on 23 June 2026, so refresh these when its results publish.
- **Prices:** every price in the prototype was checked in September 2026. The staleness workflow exists because these go out of date faster than anything else on the site.
- **The engine is guidance, not a guarantee.** Keep that disclaimer visible on the report page.
