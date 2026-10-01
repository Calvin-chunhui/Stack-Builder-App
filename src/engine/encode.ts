/**
 * Stack <-> URL string. This is what makes stacks shareable with no backend.
 *
 * Format: the eight layers in LAYER_ORDER, separated by `~`. Multi-select
 * layers join their tools with `.`. Empty layers are empty, and trailing
 * empties are dropped to keep links short.
 *
 *   nextjs~~~betterauth~neon~vercel~gha~drizzle.stripe
 *   |      | | |          |    |      |   |
 *   fe   mob be auth      db   host   ops add-ons
 *
 * Tool ids are used verbatim rather than packed into indices, so links stay
 * readable and keep working when the catalogue changes. Decoding validates
 * every id against the catalogue and checks it belongs to the layer it was
 * found in, so a hand-edited link can never produce an impossible stack.
 */
import type { Stack } from './types';
import { LAYER_ORDER, emptyStack, isMultiLayer } from './stack';
import { tool } from './catalog';

const GROUP_SEP = '~';
const ITEM_SEP = '.';

export function encodeStack(s: Stack): string {
  const groups = LAYER_ORDER.map((layer) => {
    const v = s[layer];
    if (Array.isArray(v)) return v.join(ITEM_SEP);
    return v ?? '';
  });

  // Drop trailing empty groups; decode treats missing groups as empty.
  while (groups.length && groups[groups.length - 1] === '') groups.pop();

  return groups.join(GROUP_SEP);
}

/**
 * Parses an encoded stack. Unknown ids and ids in the wrong layer are skipped
 * rather than throwing, so a damaged link still shows whatever was valid.
 */
export function decodeStack(q: string | null | undefined): Stack {
  const s = emptyStack();
  if (!q) return s;

  const groups = q.split(GROUP_SEP);

  LAYER_ORDER.forEach((layer, i) => {
    const raw = groups[i];
    if (!raw) return;

    const ids = raw
      .split(ITEM_SEP)
      .map((x) => x.trim())
      .filter(Boolean)
      // Only accept ids that exist and really live in this layer.
      .filter((id) => tool(id)?.layer === layer);

    if (isMultiLayer(layer)) {
      s[layer] = [...new Set(ids)];
    } else if (ids.length) {
      s[layer] = ids[0];
    }
  });

  return s;
}

/** True when the string decodes to at least one real tool. */
export function isDecodable(q: string | null | undefined): boolean {
  if (!q) return false;
  const s = decodeStack(q);
  return LAYER_ORDER.some((l) => {
    const v = s[l];
    return Array.isArray(v) ? v.length > 0 : Boolean(v);
  });
}

/** Builds the full shareable URL for a stack. */
export function shareUrl(s: Stack, name: string | null, origin: string): string {
  const url = new URL('/stack', origin);
  url.searchParams.set('s', encodeStack(s));
  if (name && name.trim() && name.trim() !== 'Untitled stack') url.searchParams.set('n', name.trim());
  return url.toString();
}

/** Names are free text, so they are length-capped on the way in and out. */
export const NAME_MAX = 60;

export const cleanName = (n: string | null | undefined): string =>
  (n ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
