// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

const site = process.env.PUBLIC_SITE_URL ?? 'https://stack-builder.vercel.app';

export default defineConfig({
  site,

  // Content pages are prerendered to static HTML. Only /api/og opts out
  // (`export const prerender = false`), so it is the single serverless function.
  output: 'static',
  adapter: vercel({
    imageService: false,
    webAnalytics: { enabled: false },
  }),

  integrations: [
    react(),
    mdx(),
    // Search is the growth channel, so the content pages get a sitemap. The
    // builder and shared stacks are personal views, not content to index.
    sitemap({
      filter: (page) => !/\/(builder|stack|search)\/?$/.test(new URL(page).pathname),
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
    ssr: {
      // resvg is a native addon, so it must be loaded by Node rather than
      // bundled. satori pulls in WASM and is happier external too.
      external: ['@resvg/resvg-js', 'satori'],
    },
    resolve: {
      alias: {
        '@engine': new URL('./src/engine', import.meta.url).pathname,
        '@components': new URL('./src/components', import.meta.url).pathname,
        '@data': new URL('./src/data', import.meta.url).pathname,
      },
    },
  },

  build: { inlineStylesheets: 'auto' },

  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
});
