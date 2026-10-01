/**
 * Dynamic Open Graph images: the one serverless function on the site.
 *
 * A shared /stack link previews as the actual stack and its verdict rather
 * than a bare URL, which is what makes sharing feel like a product.
 *
 *   /api/og                                      the site card
 *   /api/og?s=nextjs~~~betterauth~neon~vercel    a specific stack
 *
 * Built on satori + resvg rather than @vercel/og: that package ships a
 * pre-bundled CommonJS build whose dynamic `require` of `fs` and the harfbuzz
 * WASM cannot be loaded outside Vercel's own runtime, so the route returned an
 * error page with a 200 status. satori and resvg are plain modules that work
 * in dev, in CI and on any host.
 *
 * Layout is described with plain objects rather than JSX because Astro treats
 * .tsx files in src/pages as React pages, which would shadow this endpoint.
 */
import type { APIRoute } from 'astro';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFile } from 'node:fs/promises';
import { LAYER_ORDER, assess, cleanName, decodeStack, isEmptyStack, nm, verdictText } from '../../engine';

/** This route alone opts out of prerendering. Every other page is static. */
export const prerender = false;

const WIDTH = 1200;
const HEIGHT = 630;

const COLOR = {
  ink: '#14172B',
  panel: '#1C2038',
  line: '#353B60',
  text: '#ECEAF4',
  muted: '#A2A5C3',
  good: '#7ACBA8',
  warn: '#F4C95D',
  block: '#FF7A7A',
};

/** Layer accents, matching the design tokens in global.css. */
const LAYER_COLOR: Record<string, string> = {
  frontend: '#F4C95D',
  mobile: '#F5A962',
  backend: '#7ACBA8',
  auth: '#C9A0F0',
  database: '#7FA8E0',
  hosting: '#F09BB0',
  devops: '#B7C77A',
  addons: '#E3D6B4',
};

const VERDICT_COLOR: Record<string, string> = {
  ok: COLOR.good,
  warn: COLOR.warn,
  block: COLOR.block,
  empty: COLOR.muted,
};

/**
 * The brand font, as static WOFF instances from @fontsource (SIL OFL).
 *
 * Static rather than the variable TTF because satori's font parser cannot read
 * a variable font's `fvar` table, and WOFF rather than WOFF2 because satori
 * supports ttf/otf/woff only. satori converts text to glyph outlines, so the
 * generated PNG needs no fonts installed wherever it runs.
 */
const FONT_WEIGHTS = [400, 600, 700, 800] as const;

const fontFile = (weight: number) =>
  new URL(
    `../../../node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-${weight}-normal.woff`,
    import.meta.url,
  );

/** satori types `weight` as a literal union, so keep it narrow. */
type LoadedFont = {
  name: string;
  data: Buffer;
  weight: (typeof FONT_WEIGHTS)[number];
  style: 'normal';
};

// Read once per server instance; the files never change at runtime.
let fontCache: LoadedFont[] | null = null;

async function loadFonts(): Promise<LoadedFont[]> {
  if (!fontCache) {
    fontCache = await Promise.all(
      FONT_WEIGHTS.map(async (weight) => ({
        name: 'Bricolage Grotesque',
        data: await readFile(fontFile(weight)),
        weight,
        style: 'normal' as const,
      })),
    );
  }
  return fontCache;
}

/* ------------------------------------------------------------------ *
 * Minimal layout helpers. satori requires every container to state its
 * display mode, so these always set it.
 * ------------------------------------------------------------------ */
type Node = { type: string; props: Record<string, unknown> };

const el = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({
  type,
  props: { style, ...(children === undefined ? {} : { children }) },
});

const col = (style: Record<string, unknown>, children?: unknown) =>
  el('div', { display: 'flex', flexDirection: 'column', ...style }, children);

const row = (style: Record<string, unknown>, children?: unknown) =>
  el('div', { display: 'flex', flexDirection: 'row', ...style }, children);

const text = (style: Record<string, unknown>, content: string) =>
  el('div', { display: 'flex', ...style }, content);

/** The three-bar mark plus the wordmark. */
function brand() {
  return row({ alignItems: 'center', gap: 18 }, [
    col({ gap: 6, width: 48 }, [
      el('div', { display: 'flex', height: 10, borderRadius: 3, background: COLOR.warn, width: '70%' }),
      el('div', { display: 'flex', height: 10, borderRadius: 3, background: COLOR.good, width: '85%' }),
      el('div', { display: 'flex', height: 10, borderRadius: 3, background: '#7FA8E0', width: '100%' }),
    ]),
    text({ fontSize: 36, fontWeight: 700, color: COLOR.text }, 'Stack Builder'),
  ]);
}

/** One pill per chosen tool, tinted by its layer. */
function toolPills(picked: { id: string; layer: string }[]) {
  const MAX = 9;
  const shown = picked.slice(0, MAX);
  const rest = picked.length - shown.length;

  return row({ flexWrap: 'wrap', gap: 14 }, [
    ...shown.map((p) =>
      text(
        {
          fontSize: 30,
          fontWeight: 600,
          color: COLOR.ink,
          background: LAYER_COLOR[p.layer] ?? COLOR.muted,
          borderRadius: 10,
          padding: '10px 20px',
        },
        nm(p.id),
      ),
    ),
    ...(rest > 0
      ? [
          text(
            {
              fontSize: 30,
              color: COLOR.muted,
              border: `2px solid ${COLOR.line}`,
              borderRadius: 10,
              padding: '10px 20px',
            },
            `+${rest} more`,
          ),
        ]
      : []),
  ]);
}

function siteCard() {
  return col({ gap: 32, height: '100%' }, [
    brand(),
    text(
      { fontSize: 72, fontWeight: 800, color: COLOR.text, lineHeight: 1.05 },
      'Tech stacks, explained like a restaurant',
    ),
    text(
      { fontSize: 32, color: COLOR.muted, lineHeight: 1.4 },
      'Learn what each part does, build your own stack, and check whether it actually works.',
    ),
  ]);
}

function stackCard(encoded: string, rawName: string | null) {
  const stack = decodeStack(encoded);
  const a = assess(stack);
  const [headline] = verdictText(a);
  const name = cleanName(rawName) || 'A stack';

  // Layer order, so the shape of the stack reads the way it is built.
  const picked = LAYER_ORDER.flatMap((layer) => {
    const v = stack[layer];
    const ids = Array.isArray(v) ? v : v ? [v] : [];
    return ids.map((id) => ({ id, layer: layer as string }));
  });

  const accent = VERDICT_COLOR[a.verdict] ?? COLOR.muted;

  return col({ gap: 26, height: '100%' }, [
    row({ alignItems: 'center', justifyContent: 'space-between' }, [
      brand(),
      text({ fontSize: 26, color: COLOR.muted }, `${picked.length} parts`),
    ]),

    text({ fontSize: 60, fontWeight: 800, color: COLOR.text, lineHeight: 1.05 }, name),

    toolPills(picked),

    // Pushed to the bottom edge, under a rule.
    row(
      {
        alignItems: 'center',
        gap: 20,
        marginTop: 'auto',
        paddingTop: 28,
        borderTop: `2px solid ${COLOR.line}`,
      },
      [
        el('div', { display: 'flex', width: 22, height: 22, borderRadius: 999, background: accent }),
        text({ fontSize: 38, fontWeight: 700, color: accent }, headline),
        ...(a.verdict === 'empty'
          ? []
          : [text({ fontSize: 34, color: COLOR.muted, marginLeft: 'auto' }, `${a.score}/100`)]),
      ],
    ),
  ]);
}

export const GET: APIRoute = async ({ url }) => {
  const encoded = url.searchParams.get('s');
  const hasStack = Boolean(encoded) && !isEmptyStack(decodeStack(encoded));

  const fonts = await loadFonts();

  const svg = await satori(
    col(
      {
        width: '100%',
        height: '100%',
        padding: 64,
        background: COLOR.ink,
        border: `16px solid ${COLOR.panel}`,
      },
      hasStack ? stackCard(encoded!, url.searchParams.get('n')) : siteCard(),
    ) as never,
    {
      width: WIDTH,
      height: HEIGHT,
      fonts,
    },
  );

  const png = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng();

  return new Response(new Uint8Array(png), {
    headers: {
      'content-type': 'image/png',
      // The query string fully determines the image, so it caches hard.
      'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
};
