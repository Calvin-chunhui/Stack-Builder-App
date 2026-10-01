/**
 * The engine's and the builder's view of the catalogue.
 *
 * Reads the compact generated catalogue rather than the content JSON directly,
 * because the same module runs in the browser bundle: glob-importing 100 full
 * records would ship every description and code sample to render a tile.
 * src/engine/__tests__/content.test.ts asserts the generated catalogue stays
 * identical to the content files.
 *
 * Full records (description, concepts, code samples, pros and cons) are read
 * server-side with getCollection and never reach the client.
 */
import type { CatalogTool, LayerId } from './types';
import { CATALOG } from './catalog.generated';

/** Every tool, ordered by id so generated output never churns. */
export const TOOLS: CatalogTool[] = CATALOG;

const index = new Map(TOOLS.map((t) => [t.id, t]));

export const tool = (id: string): CatalogTool | undefined => index.get(id);

/** Display name, falling back to the raw id so unknown ids stay readable. */
export const nm = (id: string): string => index.get(id)?.name ?? id;

export const toolsInLayer = (layer: LayerId): CatalogTool[] => TOOLS.filter((t) => t.layer === layer);

export const hasTool = (id: string): boolean => index.has(id);

/**
 * Every word in the query must appear somewhere in the tool's searchable text,
 * so "python api" narrows rather than widens.
 */
export function matches(t: CatalogTool, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = t.haystack ?? `${t.name} ${t.tagline ?? ''}`.toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}
