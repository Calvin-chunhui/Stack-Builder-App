/**
 * One-time migration: lifts the data out of the single-file prototype
 * (stack-builder.html) into Content Collections and engine data modules.
 *
 *   node scripts/extract-prototype.mjs
 *
 * Re-running it is safe and idempotent. It is kept in the repo so the
 * provenance of every content file is reproducible, not hand-typed.
 *
 * Field mapping (prototype -> collection schema):
 *   tag        -> tagline            sub     -> subtitle
 *   year       -> firstRelease       desc    -> description
 *   uses       -> useCases           curve   -> learningCurve
 *   users      -> notableUsers[]     pairs   -> pairsWith[]
 *   concepts   -> concepts[{term,explanation}]
 *   version    -> version{label,lastVerified}
 *   pricing + COMPAT.$ + COMPAT.fee -> pricing{summary,freeTier,entryMonthly,usageFee,...}
 *   so + sojs  -> surveys
 *   <script type="text/plain" id="code-*"> -> codeSamples[]
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'stack-builder.html');

/** Everything in the prototype was verified against vendor pages in Sept 2026. */
const VERIFIED = '2026-09-01';

/** The five learning-curve grades the difficulty estimate is calibrated on. */
const CURVES = ['Easy to moderate', 'Moderate to steep', 'Easy', 'Moderate', 'Steep'];

/**
 * Splits a free-text curve into the graded enum plus any editorial nuance.
 * The prototype mostly used the five grades verbatim, but one record reads
 * "Steep for newcomers to functional code". The grade drives the engine; the
 * remainder is kept as a note instead of being thrown away.
 */
function splitCurve(raw, id) {
  if (CURVES.includes(raw)) return { learningCurve: raw };
  // Longest grades first, so "Easy to moderate" wins over "Easy".
  const grade = CURVES.find((c) => raw.startsWith(c));
  if (!grade) {
    problems.push(`${id}: learning curve "${raw}" does not start with a known grade`);
    return { learningCurve: 'Moderate' };
  }
  return { learningCurve: grade, learningCurveNote: raw.slice(grade.length).trim() };
}

const html = readFileSync(SRC, 'utf8');

/* ------------------------------------------------------------------ *
 * 1. Evaluate the prototype's data region to get the real objects.
 * ------------------------------------------------------------------ */
const dataStart = html.indexOf('const LAYERS = [');
const dataEnd = html.indexOf('/* ============================ APP: CORE');
if (dataStart < 0 || dataEnd < 0) throw new Error('Could not locate the data region in the prototype.');
const dataSource = html.slice(dataStart, dataEnd);

const names = [
  'LAYERS', 'CORE', 'SO', 'TOOLS', 'ADDON_CATS', 'PRESETS',
  'LANG', 'COMPAT', 'LAYER_INFO', 'RESTAURANT', 'JOURNEY', 'GLOSSARY',
];
const data = new Function(`${dataSource}\nreturn { ${names.join(', ')} };`)();

/* ------------------------------------------------------------------ *
 * 2. Pull the code samples out of the <script type="text/plain"> blocks.
 *    Script elements hold raw text, so the HTML parser never decodes
 *    character references inside them - only &lt; and &gt; were escaped
 *    by hand in the prototype, and only those get decoded here.
 * ------------------------------------------------------------------ */
const codeById = new Map();
const blockRe = /<script type="text\/plain" id="code-([^"]+)" data-lang="([^"]*)">([\s\S]*?)<\/script>/g;
for (const [, id, lang, body] of html.matchAll(blockRe)) {
  codeById.set(id, {
    label: decodeAttr(lang),
    code: body.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/^\s*\n/, '').replace(/\s+$/, ''),
  });
}

function decodeAttr(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Guess a highlight language from the prototype's human-readable label. */
function languageFromLabel(label) {
  const head = label.split('·')[0].trim().toLowerCase();
  const map = {
    jsx: 'jsx', tsx: 'tsx', typescript: 'ts', javascript: 'js', 'vue sfc': 'vue',
    'svelte 5': 'svelte', astro: 'astro', python: 'python', go: 'go', ruby: 'ruby',
    php: 'php', java: 'java', elixir: 'elixir', dart: 'dart', swift: 'swift',
    kotlin: 'kotlin', sql: 'sql', 't-sql': 'sql', 'mongodb shell': 'js',
    'redis commands': 'shell', json: 'json', toml: 'toml', yaml: 'yaml',
    dockerfile: 'dockerfile', hcl: 'hcl', shell: 'shell', groovy: 'groovy',
    graphql: 'graphql', 'c#': 'csharp', html: 'html',
  };
  if (map[head]) return map[head];
  for (const [k, v] of Object.entries(map)) if (head.startsWith(k)) return v;
  if (head.includes('shell')) return 'shell';
  if (head.includes('html')) return 'html';
  if (head.includes('prisma')) return 'prisma';
  return 'text';
}

/* ------------------------------------------------------------------ *
 * 3. Output helpers
 * ------------------------------------------------------------------ */
const problems = [];
const stats = {};

function fresh(dir) {
  const p = join(ROOT, dir);
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  mkdirSync(p, { recursive: true });
  return p;
}
function writeJson(dir, name, value) {
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(value, null, 2) + '\n', 'utf8');
}
function check(cond, msg) {
  if (!cond) problems.push(msg);
}

/* ------------------------------------------------------------------ *
 * 4. Tools -> src/content/tools/*.json
 * ------------------------------------------------------------------ */
const toolsDir = fresh('src/content/tools');
const layerIds = new Set(data.LAYERS.map((l) => l.id));
const toolIds = new Set(data.TOOLS.map((t) => t.id));

for (const t of data.TOOLS) {
  const compat = data.COMPAT[t.id] ?? {};
  check(data.COMPAT[t.id] !== undefined, `${t.id}: no COMPAT entry, the engine cannot assess it`);
  check(layerIds.has(t.layer), `${t.id}: unknown layer "${t.layer}"`);
  check(t.tag.length <= 40, `${t.id}: tagline is ${t.tag.length} chars (max 40): "${t.tag}"`);
  check(t.uses.length >= 2, `${t.id}: only ${t.uses.length} useCases (min 2)`);
  check(t.concepts.length >= 4, `${t.id}: only ${t.concepts.length} concepts (min 4)`);
  check(t.pros.length >= 3, `${t.id}: only ${t.pros.length} pros (min 3)`);
  check(t.cons.length >= 2, `${t.id}: only ${t.cons.length} cons (min 2)`);

  const samples = [codeById.get(t.id), codeById.get(`${t.id}-2`)]
    .filter(Boolean)
    .map((s) => ({ label: s.label, language: languageFromLabel(s.label), code: s.code }));
  check(samples.length >= 1, `${t.id}: no code sample found (min 1)`);
  for (const s of samples) {
    check(!s.code.includes('&amp;'), `${t.id}: code sample still contains a raw &amp; entity`);
  }

  // Cost now lives with the tool record instead of being duplicated in COMPAT.
  const money = compat.$;
  check(Array.isArray(money), `${t.id}: COMPAT has no $ (pricing) tuple`);
  const pricing = {
    summary: t.pricing,
    freeTier: money ? money[0] === true : true,
    entryMonthly: money ? (money[1] === null ? null : money[1]) : 0,
    ...(compat.fee ? { usageFee: compat.fee } : {}),
    lastVerified: VERIFIED,
    sourceUrl: t.site,
  };

  const record = {
    id: t.id,
    name: t.name,
    monogram: t.mono,
    layer: t.layer,
    ...(t.cat ? { category: t.cat } : {}),
    subtitle: t.sub,
    tagline: t.tag,
    firstRelease: t.year,
    creator: t.creator,
    maintainer: t.maintainer,
    version: { label: t.version, lastVerified: VERIFIED },
    license: t.license,
    ...splitCurve(t.curve, t.id),
    description: t.desc,
    useCases: t.uses,
    // The prototype listed these as bare names. sourceUrl is optional in the
    // schema rather than invented here; scripts/check-staleness.ts reports
    // every uncited entry so they can be backfilled from vendor case studies.
    notableUsers: t.users.map((name) => ({ name })),
    languages: { written: t.langImpl, youWrite: t.langDev },
    concepts: t.concepts.map(([term, explanation]) => ({ term, explanation })),
    codeSamples: samples,
    // Some `pairs` entries name a library that has no page of its own
    // (e.g. "Vite"). `resolved` records whether toolId points at a real tool.
    pairsWith: t.pairs.map(([toolId, reason]) => ({
      toolId,
      reason,
      resolved: toolIds.has(toolId),
    })),
    pros: t.pros,
    cons: t.cons,
    pricing,
    flags: t.flags ?? [],
    links: { site: t.site, docs: t.docs },
    ...(t.logo ? { logo: t.logo } : {}),
    ...(t.so || t.sojs
      ? {
          surveys: {
            source: t.so ? data.SO : 'State of JavaScript 2025',
            ...(t.so?.cat ? { category: t.so.cat } : {}),
            ...(t.so?.use !== undefined ? { used: t.so.use } : {}),
            ...(t.so?.adm !== undefined ? { admired: t.so.adm } : {}),
            ...(t.sojs ? { satisfaction: t.sojs } : {}),
          },
        }
      : {}),
  };
  writeJson(toolsDir, t.id, record);
}
stats.tools = data.TOOLS.length;

// Cross-check every pairsWith/starter/preset reference.
for (const t of data.TOOLS) {
  for (const [pid] of t.pairs) {
    if (!toolIds.has(pid) && /^[a-z0-9]+$/.test(pid)) {
      problems.push(`${t.id}: pairsWith "${pid}" looks like a tool id but no such tool exists`);
    }
  }
}

/* ------------------------------------------------------------------ *
 * 5. Recipes -> src/content/recipes/*.json
 * ------------------------------------------------------------------ */
const recipesDir = fresh('src/content/recipes');
for (const p of data.PRESETS) {
  const stack = {
    frontend: p.stack.frontend ?? null,
    mobile: p.stack.mobile ?? null,
    backend: p.stack.backend ?? null,
    auth: p.stack.auth ?? null,
    database: p.stack.database ?? null,
    hosting: p.stack.hosting ?? null,
    devops: p.stack.devops ?? [],
    addons: p.stack.addons ?? [],
  };
  for (const [layer, v] of Object.entries(stack)) {
    for (const id of Array.isArray(v) ? v : v ? [v] : []) {
      check(toolIds.has(id), `recipe ${p.id}: ${layer} references unknown tool "${id}"`);
    }
  }
  writeJson(recipesDir, p.id, {
    id: p.id,
    name: p.name,
    parts: p.parts,
    stack,
    origin: p.origin,
    goodFor: p.good,
    pros: p.pros,
    cons: p.cons,
  });
}
stats.recipes = data.PRESETS.length;

/* ------------------------------------------------------------------ *
 * 6. Glossary -> src/content/glossary/*.json
 * ------------------------------------------------------------------ */
const glossDir = fresh('src/content/glossary');
for (const [id, term, definition, like, layer] of data.GLOSSARY) {
  check(!layer || layerIds.has(layer), `glossary ${id}: unknown layer "${layer}"`);
  writeJson(glossDir, id, { id, term, definition, like: like ?? null, layer: layer ?? null });
}
stats.glossary = data.GLOSSARY.length;

/* ------------------------------------------------------------------ *
 * 7. Layer hubs -> src/content/layers/*.mdx
 *    The prose body becomes MDX content so it can grow; the structured
 *    parts (analogy, flow, starters, key terms) stay in frontmatter.
 * ------------------------------------------------------------------ */
const layersDir = fresh('src/content/layers');
const glossaryIds = new Set(data.GLOSSARY.map((g) => g[0]));
const yamlStr = (s) => JSON.stringify(String(s));

for (const L of data.LAYERS) {
  const I = data.LAYER_INFO[L.id];
  check(I, `layer ${L.id}: no LAYER_INFO entry`);
  for (const term of I.terms) check(glossaryIds.has(term), `layer ${L.id}: key term "${term}" is not in the glossary`);
  for (const [id] of I.starters) check(toolIds.has(id), `layer ${L.id}: starter "${id}" is not a tool`);

  const zone = data.RESTAURANT.find((z) => z.layer === L.id);
  const fm = [
    '---',
    `id: ${L.id}`,
    `name: ${yamlStr(L.name)}`,
    `title: ${yamlStr(I.title)}`,
    `blurb: ${yamlStr(L.blurb)}`,
    `order: ${data.LAYERS.indexOf(L)}`,
    `optional: ${Boolean(L.optional)}`,
    `multi: ${Boolean(L.multi)}`,
    `color: ${yamlStr(L.c)}`,
    `place: ${yamlStr(I.place)}`,
    `analogy: ${yamlStr(I.analogy)}`,
    ...(zone ? [`zoneLabel: ${yamlStr(zone.label)}`, `zoneText: ${yamlStr(zone.text)}`] : []),
    'points:',
    ...I.points.map((p) => `  - ${yamlStr(p)}`),
    'terms:',
    ...I.terms.map((t) => `  - ${yamlStr(t)}`),
    'starters:',
    ...I.starters.flatMap(([id, why]) => [`  - toolId: ${yamlStr(id)}`, `    why: ${yamlStr(why)}`]),
    'flow:',
    ...I.flow.flatMap(([step, detail]) => [`  - step: ${yamlStr(step)}`, `    detail: ${yamlStr(detail)}`]),
    '---',
    '',
    I.body,
    '',
  ].join('\n');
  writeFileSync(join(layersDir, `${L.id}.mdx`), fm, 'utf8');
}
stats.layers = data.LAYERS.length;

/* ------------------------------------------------------------------ *
 * 8. Engine + taxonomy data modules
 * ------------------------------------------------------------------ */
mkdirSync(join(ROOT, 'src/engine'), { recursive: true });
mkdirSync(join(ROOT, 'src/data'), { recursive: true });

// COMPAT, minus `$`/`fee`: money moved into each tool's pricing record so
// there is exactly one source of truth for a price.
const compatOut = {};
for (const [id, attrs] of Object.entries(data.COMPAT)) {
  const { $: _money, fee: _fee, ...rest } = attrs;
  compatOut[id] = rest;
  check(toolIds.has(id), `COMPAT has an entry for "${id}" but there is no such tool`);
}

writeFileSync(
  join(ROOT, 'src/engine/compat.generated.ts'),
  `/* GENERATED by scripts/extract-prototype.mjs - do not edit by hand.
 *
 * Compatibility attributes: the facts the feasibility engine reasons over.
 * Pricing is NOT here; it lives in each tool's content record under \`pricing\`.
 *
 *   frontend  r: spa | meta | islands | html | static   srv: has server routes
 *   backend   runs: server|container|serverless|edge    mongo: native|adapter|poor
 *   database  conn: tcp|http|embedded|sdk               sls: serverless-friendly
 *   auth      kind: hosted|library|baas|selfhost        sdk: "any" | languages[]
 *   hosting   runs: static|serverless|edge|server|container
 *   add-ons   needs: frontend|react|server|js-server|ts-both|selfhost|any
 */
import type { CompatAttrs } from './types';

export const COMPAT: Record<string, CompatAttrs> = ${JSON.stringify(compatOut, null, 2)};
`,
  'utf8',
);

/*
 * A compact catalogue for the engine and the builder island.
 *
 * Why generated rather than read with import.meta.glob: glob imports the whole
 * JSON file, so the browser bundle would carry every description, concept and
 * code sample (~400 KB) just to render tiles. This holds only the fields the
 * engine and the picker need. The full records stay server-side, reached
 * through getCollection, and a test asserts the two never drift apart.
 */
const layerNameById = Object.fromEntries(data.LAYERS.map((l) => [l.id, l.name]));
const catNameById = Object.fromEntries(data.ADDON_CATS.map((c) => [c.id, c.name]));

const catalogOut = data.TOOLS.map((t) => {
  const money = data.COMPAT[t.id]?.$;
  const fee = data.COMPAT[t.id]?.fee;
  // Pre-built, pre-lowercased search haystack: the picker filters on every
  // keystroke, so this avoids rebuilding it per render.
  const haystack = [
    t.name,
    t.tag,
    t.sub,
    t.langDev,
    t.langImpl,
    layerNameById[t.layer],
    t.cat ? catNameById[t.cat] : '',
    ...(t.uses ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return {
    id: t.id,
    name: t.name,
    monogram: t.mono,
    layer: t.layer,
    ...(t.cat ? { category: t.cat } : {}),
    subtitle: t.sub,
    tagline: t.tag,
    learningCurve: splitCurve(t.curve, t.id).learningCurve,
    popularity: t.so?.use ?? 0,
    pricing: {
      freeTier: money ? money[0] === true : true,
      entryMonthly: money ? (money[1] === null ? null : money[1]) : 0,
      ...(fee ? { usageFee: fee } : {}),
    },
    haystack,
  };
}).sort((a, b) => a.id.localeCompare(b.id));

writeFileSync(
  join(ROOT, 'src/engine/catalog.generated.ts'),
  `/* GENERATED by scripts/extract-prototype.mjs - do not edit by hand.
 *
 * The engine's and the builder's view of the catalogue: only the fields they
 * need, so the browser bundle stays small. Full tool records live in
 * src/content/tools/*.json and are read server-side with getCollection.
 */
import type { CatalogTool } from './types';

export const CATALOG: CatalogTool[] = ${JSON.stringify(catalogOut, null, 2)};
`,
  'utf8',
);

writeFileSync(
  join(ROOT, 'src/data/taxonomy.generated.ts'),
  `/* GENERATED by scripts/extract-prototype.mjs - do not edit by hand. */
import type { LayerId } from '../engine/types';

export interface LayerMeta {
  id: LayerId;
  name: string;
  /** CSS custom property holding this layer's accent colour. */
  c: string;
  blurb: string;
  optional?: boolean;
  multi?: boolean;
}

export const LAYERS: LayerMeta[] = ${JSON.stringify(data.LAYERS, null, 2)};

/** Layers that count towards "n of 6 core layers". */
export const CORE = ${JSON.stringify(data.CORE)} as const;

/** Add-on sub-categories, in display order. */
export const ADDON_CATS = ${JSON.stringify(data.ADDON_CATS, null, 2)};

/** Programming-language labels used throughout the report copy. */
export const LANG: Record<string, string> = ${JSON.stringify(data.LANG, null, 2)};

/** Survey attribution, cited once and reused. */
export const SURVEY_SOURCE = ${JSON.stringify(data.SO)};
`,
  'utf8',
);

writeFileSync(
  join(ROOT, 'src/data/learn.generated.ts'),
  `/* GENERATED by scripts/extract-prototype.mjs - do not edit by hand. */
import type { LayerId } from '../engine/types';

export interface Zone {
  id: string;
  label: string;
  layer: LayerId | null;
  text: string;
}

/** Restaurant floor-plan zones for the Learn page. */
export const RESTAURANT: Zone[] = ${JSON.stringify(data.RESTAURANT, null, 2)};

export interface JourneyStep {
  node: string;
  title: string;
  text: string;
  food: string;
}

/** One request, start to finish. A genuine sequence, so it is numbered. */
export const JOURNEY: JourneyStep[] = ${JSON.stringify(data.JOURNEY, null, 2)};
`,
  'utf8',
);

/* ------------------------------------------------------------------ *
 * 9. Report
 * ------------------------------------------------------------------ */
console.log('Extracted from the prototype:');
for (const [k, v] of Object.entries(stats)) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log(`  ${String(codeById.size).padStart(4)}  code samples`);
console.log(`  ${String(Object.keys(compatOut).length).padStart(4)}  compat entries`);

if (problems.length) {
  console.log(`\n${problems.length} data issue(s):`);
  for (const p of problems) console.log(`  - ${p}`);
} else {
  console.log('\nNo data issues.');
}
