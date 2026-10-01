/**
 * Fix suggestions: given a finding, try swapping tools in and keep the ones
 * that actually make the report better.
 *
 * This is brute force over a small fixed dataset (at most ~30 candidates in a
 * layer, each a full assess()), which is fast enough to run on every render.
 */
import type { Assessment, Finding, FixSuggestion, Stack } from './types';
import { assess } from './assess';
import { stackHas, withTool } from './stack';
import { toolsInLayer } from './catalog';

const MAX_SUGGESTIONS = 3;

export function suggestFixes(s: Stack, item: Finding, base: Assessment): FixSuggestion[] {
  if (!item.fix) return [];

  // A straight removal needs no search.
  if (item.fix.remove) {
    return [{ type: 'remove', id: item.fix.remove, ...(item.fix.note ? { note: item.fix.note } : {}) }];
  }

  const layer = item.fix.layer;
  if (!layer) return [];

  const swaps: FixSuggestion[] = [];
  for (const candidate of toolsInLayer(layer)) {
    if (stackHas(s, candidate.id)) continue;
    const r = assess(withTool(s, candidate.id));
    // Only offer a swap that removes a blocker, or holds blockers level while
    // reducing warnings. Anything else is noise.
    const better = r.blocks < base.blocks || (r.blocks === base.blocks && r.warns < base.warns);
    if (!better) continue;
    swaps.push({
      type: 'swap',
      id: candidate.id,
      blocks: r.blocks,
      warns: r.warns,
      infos: r.infos,
      popularity: candidate.popularity,
    });
  }

  // Fewest problems first, then most popular as the tie-break.
  swaps.sort((a, b) => {
    if (a.type !== 'swap' || b.type !== 'swap') return 0;
    return a.blocks - b.blocks || a.warns - b.warns || a.infos - b.infos || b.popularity - a.popularity;
  });

  const lead: FixSuggestion[] = item.fix.alsoRemove
    ? [{ type: 'remove', id: item.fix.alsoRemove, ...(item.fix.note ? { note: item.fix.note } : {}) }]
    : [];

  return [...lead, ...swaps].slice(0, MAX_SUGGESTIONS);
}
