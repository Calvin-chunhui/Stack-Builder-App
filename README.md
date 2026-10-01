# Stack Builder

Learn what each part of a web app does, build a tech stack, and find out whether
the combination actually works.

Built from `stack-builder.html` (the original single-file prototype, kept in the
repo as the reference) following `stack-builder-build-plan.md`.

**Astro 7 + a React island for the builder + TypeScript + Tailwind CSS**, content
in Astro Content Collections, deployed to Vercel. No backend, no database, no
secret keys.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:4321
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build, then the Pagefind search index |
| `npm run preview` | Serve the production build |
| `npm test` | Engine tests (Vitest) |
| `npm run typecheck` | `astro check` |
| `npm run check:data` | Flag prices and versions past their 90-day window |
| `npm run extract` | Regenerate content and data from the prototype |

Requires Node 24+ (the staleness script is TypeScript run directly by Node).

---

## How it fits together

```
src/
├─ content/              100 tools, 13 recipes, 80 glossary terms, 8 layer hubs
│  └─ …                  validated by src/content.config.ts at build time
├─ engine/               the product's brain. No framework imports.
│  ├─ rules.ts           31 named, independently testable rules
│  ├─ assess.ts          runs the rules, returns a verdict + findings
│  ├─ suggest.ts         fix suggestions (swap / remove)
│  ├─ summarize.ts       languages, difficulty, cost
│  ├─ encode.ts          stack <-> URL string
│  └─ __tests__/         198 tests
├─ components/
│  ├─ builder/           the React island (the only hydrated page)
│  └─ learn/             floor plan and request journey, as Astro components
└─ pages/
   ├─ index.astro        Learn
   ├─ builder.astro      hosts the React island
   ├─ stack.astro        a shared stack from ?s=
   ├─ library/           index, 8 hubs, 100 tool pages
   ├─ recipes/[id]       13 recipe pages with full reports
   ├─ glossary.astro
   └─ api/og.ts          dynamic preview images (the one serverless function)
```

### Three ideas worth knowing

**The engine is separable and framework-free.** Nothing in `src/engine` imports
Astro, React or the DOM, so the same code runs in the build (recipe pages get
their verdicts at build time), in the browser (the builder) and in Vitest.

**Content Collections enforce data quality.** A missing `lastVerified`, a
malformed price or an add-on with no category fails the build rather than
shipping a wrong number. `git log src/content/tools/vercel.json` then gives a
free audit trail of every price change, with a date and an author.

**Stacks are shareable with no storage.** A stack is encoded into the URL:

```
/stack?s=nextjs~~~betterauth~neon~vercel~gha~drizzle.stripe
         │      │ │ │          │    │      │   └─ add-ons (joined by .)
         │      │ │ │          │    │      └───── devops
         frontend─┴─backend────┴────┴──── the eight layers, in fixed order
```

Decoding validates every id against the catalogue *and* checks it belongs to the
layer it was found in, so a hand-edited link can never produce an impossible
stack. `/api/og` reads the same parameter, so a shared link previews as the
actual stack and its verdict.

---

## Adding or changing data

Tool records live one-per-file in `src/content/tools/`. Edit the JSON and the
schema in `src/content.config.ts` will tell you if anything is wrong.

Two generated files must stay in step with the content, and CI fails if they
drift:

- `src/engine/catalog.generated.ts` — a compact catalogue (id, name, layer,
  pricing, search text) that the browser bundle uses. Generated because
  glob-importing all 100 full records would ship every description and code
  sample (~400 KB) just to render a tile.
- `src/engine/compat.generated.ts` — the compatibility attributes the rules
  reason over.

After editing content, run `npm run extract` and commit the result.

> **Prices.** Every figure was checked in September 2026 against the vendor page
> recorded in `pricing.sourceUrl`. The monthly workflow in
> `.github/workflows/staleness.yml` opens an issue listing anything past 90 days.

> **Logos.** Monogram tiles are the default on purpose. Only add a `logo` where
> the vendor's brand page grants usage rights.

> **Notable users.** `sourceUrl` is optional on these, and 85 entries carried
> over from the prototype without one. `npm run check:data` lists them. The plan
> asked for a citation on every entry; inventing URLs was the wrong way to get
> there, so they are reported as a known gap instead.

---

## Adding a rule

Rules are the product. Each is small, named and tested on its own.

```ts
// src/engine/rules.ts
{
  id: 'auth-library-needs-js-server',
  group: 'auth',
  check: (s, ctx) => {
    if (!s.auth || ctx.A.kind !== 'library') return null;
    if (ctx.jsServer) return { severity: 'ok', /* … */ };
    return {
      severity: 'block',
      ids: [s.auth, s.backend].filter(Boolean),
      message: `<b>${ctx.name(s.auth)} runs inside a JavaScript or TypeScript server.</b> …`,
      fix: { layer: 'auth', alsoRemove: s.auth },
    };
  },
}
```

Then add a case to `src/engine/__tests__/rules.test.ts`. The test that matters
most is in `recipes.test.ts`: **every stack the site advertises must still have
zero blockers.** Add a rule six months from now and it will tell you
immediately if you broke a recipe shown on the home page.

---

## Deploying

The Vercel adapter is already configured. Push the repo to GitHub, import it in
Vercel, and set one environment variable:

```
PUBLIC_SITE_URL = https://your-domain.com
```

It is used for canonical URLs, the sitemap and absolute OG image URLs. Build
command and output directory need no changes — `npm run build` produces
`.vercel/output`, with the Pagefind index written into the static output.

Moving to Cloudflare later is an adapter swap in `astro.config.mjs`, not a
rewrite.

### What runs where

Every page is prerendered to static HTML and ships **no framework runtime** — a
tool page is ~32 KB of HTML with no React. Two exceptions:

- `/builder` and `/stack` hydrate the React island (`client:load`).
- `/api/og` is the single serverless function (`export const prerender = false`).

---

## When to add a backend

Not yet. Add one when you want a specific thing only it can do:

| Trigger | What to add |
| --- | --- |
| Saved stacks syncing across devices | Postgres (Neon or Supabase) + Better Auth |
| A public gallery of community stacks | The same, plus moderation |
| Non-technical editors updating tool data | A headless CMS, or an admin route behind auth |
| Per-stack analytics | PostHog first; a database only if you outgrow it |

Until one of those is true, a database adds backup, migration, connection and
cost concerns while solving nothing. URL encoding already covers sharing, which
is the thing people usually build accounts for.

---

## Caveats

- **The engine is guidance, not a guarantee.** This disclaimer is visible on
  every report page, and should stay there.
- **Survey figures** cite Stack Overflow 2025 (all respondents) and State of JS
  2025 consistently. The Stack Overflow 2026 survey opened 23 June 2026; refresh
  these when its results publish.
- The brand font is bundled for OG images via `@fontsource/bricolage-grotesque`
  (SIL OFL). Static WOFF instances, because satori cannot read a variable
  font's `fvar` table and does not support WOFF2.
