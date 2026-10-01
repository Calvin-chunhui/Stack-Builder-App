/**
 * assess(stack) judges ANY combination from the COMPAT attributes, so custom
 * stacks get real answers rather than only the hand-picked pairings.
 */
import type { Assessment, CompatAttrs, Finding, GroupId, RuleContext, Severity, Stack } from './types';
import { COMPAT } from './compat.generated';
import { GROUPS, SCORE_WEIGHTS, SEV_RANK } from './groups';
import { isServerful, rules } from './rules';
import { coreCount, normalizeStack, pickedIds } from './stack';
import { nm, tool } from './catalog';
import { LANG } from '../data/taxonomy';

/** Returned for an unset or unknown layer, so rules can read attributes freely. */
const EMPTY_ATTRS: CompatAttrs = {};

/** Builds the derived facts every rule reads. */
export function buildContext(s: Stack): RuleContext {
  const compat = (id: string | null | undefined) => (id ? COMPAT[id] ?? EMPTY_ATTRS : EMPTY_ATTRS);

  const F = compat(s.frontend);
  const M = compat(s.mobile);
  const B = compat(s.backend);
  const A = compat(s.auth);
  const D = compat(s.database);
  const H = compat(s.hosting);

  // A frontend meta-framework (Next.js, Nuxt, SvelteKit, Astro) ships server
  // routes, so it counts as a place trusted code and secrets can live.
  const hasServer = Boolean(s.backend) || Boolean(s.frontend && F.srv);
  const serverLanguage = s.backend ? B.lang ?? null : s.frontend && F.srv ? 'js' : null;
  const hostRuns = s.hosting ? (H.runs === 'any' ? [] : H.runs ?? []) : [];

  return {
    compat,
    name: nm,
    tool,
    F,
    M,
    B,
    A,
    D,
    H,
    hasServer,
    serverLanguage,
    jsServer: serverLanguage === 'js',
    isBaaS: Boolean(s.database && D.baas),
    hostRuns,
    anyUI: s.frontend || s.mobile,
    coreCount: coreCount(s),
    pickedCount: pickedIds(s).length,
    lang: (key) => (key ? LANG[key] ?? key : ''),
    serverful: isServerful(hostRuns),
  };
}

/**
 * Runs every rule against the stack.
 *
 * @param input a full or partial stack; missing layers are treated as empty.
 */
export function assess(input: Partial<Stack> | Stack): Assessment {
  const s = normalizeStack(input as Partial<Stack>);
  const ctx = buildContext(s);

  const items: Finding[] = [];
  for (const rule of rules) {
    const result = rule.check(s, ctx);
    if (!result) continue;
    for (const f of Array.isArray(result) ? result : [result]) {
      items.push({
        severity: f.severity,
        group: rule.group,
        ids: (f.ids ?? []).filter(Boolean),
        message: f.message,
        ...(f.fix ? { fix: f.fix } : {}),
        rule: rule.id,
      });
    }
  }

  const count = (sev: Severity) => items.filter((i) => i.severity === sev).length;
  const blocks = count('block');
  const warns = count('warn');
  const infos = count('info');
  const picked = pickedIds(s).length;

  const verdict = !picked ? 'empty' : blocks ? 'block' : warns ? 'warn' : 'ok';

  const score = picked
    ? Math.max(
        SCORE_WEIGHTS.floor,
        100 - blocks * SCORE_WEIGHTS.block - warns * SCORE_WEIGHTS.warn - infos * SCORE_WEIGHTS.info,
      )
    : 0;

  // Worst finding wins per group; `none` means nothing was checked there yet.
  const groupStatus = Object.fromEntries(
    GROUPS.map((g) => {
      const inGroup = items.filter((i) => i.group === g.id);
      if (!inGroup.length) return [g.id, 'none'];
      const worst = inGroup.reduce<Severity>(
        (w, i) => (SEV_RANK[i.severity] > SEV_RANK[w] ? i.severity : w),
        'ok',
      );
      return [g.id, worst];
    }),
  ) as Record<GroupId, Severity | 'none'>;

  // Stable sort: worst first, insertion order preserved within a severity.
  items.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]);

  return { items, blocks, warns, infos, verdict, score, groupStatus };
}

/** Headline and sub-line for a verdict. */
export function verdictText(a: Assessment): [string, string] {
  switch (a.verdict) {
    case 'block':
      return [
        "Won't work as-is",
        `${a.blocks} ${a.blocks === 1 ? 'part needs' : 'parts need'} changing before this can run.`,
      ];
    case 'warn':
      return [
        'Works, with some care',
        `It can run, but ${a.warns} ${a.warns === 1 ? 'thing needs' : 'things need'} attention.`,
      ];
    case 'ok':
      return ['Looks feasible', 'These parts fit together. Nothing blocks it from running.'];
    default:
      return ['Start picking tools', 'The report updates as you build.'];
  }
}

export { GROUPS };
