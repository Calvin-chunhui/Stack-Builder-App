/**
 * Layer taxonomy and language labels.
 *
 * The values are generated from the prototype (taxonomy.generated.ts) and
 * re-exported here so the rest of the app imports a stable path. Add
 * hand-maintained taxonomy below the re-exports rather than editing the
 * generated file, which scripts/extract-prototype.mjs overwrites.
 */
export { LAYERS, CORE, ADDON_CATS, LANG, SURVEY_SOURCE } from './taxonomy.generated';
export type { LayerMeta } from './taxonomy.generated';

import { LAYERS, ADDON_CATS } from './taxonomy.generated';
import type { LayerId } from '../engine/types';

const layerIndex = new Map(LAYERS.map((l) => [l.id, l]));

export const layerById = (id: LayerId) => layerIndex.get(id);

/** `var(--fe)` etc., for inline `--c` custom properties. */
export const layerColor = (id: LayerId): string => `var(${layerIndex.get(id)?.c ?? '--text'})`;

export const layerName = (id: LayerId): string => layerIndex.get(id)?.name ?? id;

export const addonCatName = (id: string | undefined): string =>
  (id ? ADDON_CATS.find((c) => c.id === id)?.name : '') ?? '';
