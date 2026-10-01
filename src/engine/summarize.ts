/**
 * What you'd actually write, how hard it is, and what it costs.
 *
 * Prices come from each tool's content record (`pricing`), which is the single
 * source of truth and carries its own `lastVerified` date.
 */
import type { Stack, Summary } from './types';
import { COMPAT } from './compat.generated';
import { CURVE } from './groups';
import { normalizeStack, pickedIds } from './stack';
import { tool } from './catalog';
import { LANG } from '../data/taxonomy';

/** Difficulty thresholds for the weighted learning-curve average. */
const COMPLEXITY = { beginner: 1.8, moderate: 2.4 } as const;

export function summarize(input: Partial<Stack> | Stack): Summary {
  const s = normalizeStack(input as Partial<Stack>);
  const ids = pickedIds(s);
  const C = (id: string | null) => (id ? COMPAT[id] ?? {} : {});

  /* ---------- Languages you will actually write ---------- */
  const langs = new Set<string>();
  if (s.frontend) {
    langs.add('HTML & CSS');
    // htmx is the one frontend where you write no JavaScript yourself.
    if (s.frontend !== 'htmx') langs.add('JavaScript/TypeScript');
  }
  if (s.mobile) langs.add(LANG[C(s.mobile).lang ?? ''] ?? '');
  if (s.backend) langs.add(LANG[C(s.backend).lang ?? ''] ?? '');
  if (s.frontend && C(s.frontend).srv && !s.backend) langs.add('JavaScript/TypeScript');
  if (s.database && C(s.database).model === 'sql') langs.add('SQL');
  for (const o of s.devops) {
    const kind = C(o).kind;
    if (kind && ['ci', 'orchestrator', 'config'].includes(kind)) {
      langs.add(o === 'jenkins' ? 'Groovy' : 'YAML');
    }
    if (kind === 'iac') langs.add('HCL');
    if (kind === 'container') langs.add('Dockerfile');
  }
  langs.delete('');

  /* ---------- Difficulty ---------- */
  const curves = ids.map((id) => {
    const label = tool(id)?.learningCurve ?? 'Moderate';
    return CURVE[label] ?? (label.startsWith('Steep') ? 3 : 2);
  });
  const avg = curves.length ? curves.reduce((a, b) => a + b, 0) / curves.length : 0;

  const progLangs = new Set(
    [s.frontend && C(s.frontend).lang, s.mobile && C(s.mobile).lang, s.backend && C(s.backend).lang].filter(
      Boolean,
    ),
  );
  // Extra languages and sheer part count both add real-world difficulty.
  const weighted = avg + Math.max(0, progLangs.size - 1) * 0.4 + Math.max(0, ids.length - 7) * 0.08;
  const complexity = !ids.length
    ? '—'
    : weighted < COMPLEXITY.beginner
      ? 'Beginner-friendly'
      : weighted < COMPLEXITY.moderate
        ? 'Moderate'
        : 'Advanced';

  /* ---------- Cost ---------- */
  const priceOf = (id: string) => tool(id)?.pricing;

  const paidNow = ids.filter((id) => priceOf(id)?.freeTier === false);
  const startCost = paidNow.reduce((sum, id) => sum + (priceOf(id)?.entryMonthly ?? 0), 0);

  let later = 0;
  let usage = false;
  for (const id of ids) {
    const p = priceOf(id);
    if (!p) continue;
    if (p.entryMonthly === null) usage = true;
    else later += p.entryMonthly;
  }

  const fees = [...new Set(ids.map((id) => priceOf(id)?.usageFee).filter((f): f is string => Boolean(f)))];

  return {
    langs: [...langs],
    complexity,
    paidNow,
    startCost,
    later: Math.round(later),
    usage,
    fees,
    parts: ids.length,
  };
}
