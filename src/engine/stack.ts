/**
 * Stack shape and the pure operations on it. Every function returns a new
 * stack; nothing here mutates its input.
 */
import type { LayerId, MultiLayerId, Stack } from './types';
import { tool } from './catalog';

/** Fixed layer order. The URL encoding depends on this, so never reorder it. */
export const LAYER_ORDER: readonly LayerId[] = [
  'frontend',
  'mobile',
  'backend',
  'auth',
  'database',
  'hosting',
  'devops',
  'addons',
] as const;

const MULTI: readonly MultiLayerId[] = ['devops', 'addons'] as const;

/** Layers counted by "n of 6 core layers". */
export const CORE_LAYERS: readonly LayerId[] = [
  'frontend',
  'backend',
  'auth',
  'database',
  'hosting',
  'devops',
] as const;

export const isMultiLayer = (layer: LayerId): layer is MultiLayerId =>
  (MULTI as readonly LayerId[]).includes(layer);

export const emptyStack = (): Stack => ({
  frontend: null,
  mobile: null,
  backend: null,
  auth: null,
  database: null,
  hosting: null,
  devops: [],
  addons: [],
});

/** Fills in any missing keys, so partial stacks (recipes, old saves) are safe. */
export const normalizeStack = (partial: Partial<Stack> | null | undefined): Stack => {
  const s = emptyStack();
  if (!partial) return s;
  for (const layer of LAYER_ORDER) {
    const v = partial[layer];
    if (isMultiLayer(layer)) {
      s[layer] = Array.isArray(v) ? [...(v as string[])] : [];
    } else if (typeof v === 'string' && v) {
      s[layer] = v;
    }
  }
  return s;
};

export const cloneStack = (s: Stack): Stack => ({ ...s, devops: [...s.devops], addons: [...s.addons] });

export function stackHas(s: Stack, id: string): boolean {
  const t = tool(id);
  if (!t) return false;
  const v = s[t.layer];
  return Array.isArray(v) ? v.includes(id) : v === id;
}

/** Adds a tool, replacing the current pick in single-choice layers. */
export function withTool(s: Stack, id: string): Stack {
  const t = tool(id);
  if (!t) return s;
  const next = cloneStack(s);
  if (isMultiLayer(t.layer)) {
    if (!next[t.layer].includes(id)) next[t.layer] = [...next[t.layer], id];
  } else {
    next[t.layer] = id;
  }
  return next;
}

export function withoutTool(s: Stack, id: string): Stack {
  const t = tool(id);
  if (!t) return s;
  const next = cloneStack(s);
  if (isMultiLayer(t.layer)) {
    next[t.layer] = next[t.layer].filter((x) => x !== id);
  } else if (next[t.layer] === id) {
    next[t.layer] = null;
  }
  return next;
}

export function toggleTool(s: Stack, id: string): Stack {
  return stackHas(s, id) ? withoutTool(s, id) : withTool(s, id);
}

/** Every chosen tool id, in layer order. */
export function pickedIds(s: Stack): string[] {
  return LAYER_ORDER.flatMap((layer) => {
    const v = s[layer];
    return Array.isArray(v) ? v : v ? [v] : [];
  });
}

export function coreCount(s: Stack): number {
  return CORE_LAYERS.filter((layer) => {
    const v = s[layer];
    return Array.isArray(v) ? v.length > 0 : Boolean(v);
  }).length;
}

export const isEmptyStack = (s: Stack): boolean => pickedIds(s).length === 0;
