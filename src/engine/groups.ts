/**
 * The six connections a report is organised around, plus the scales used to
 * rank findings and estimate difficulty.
 */
import type { GroupMeta, Severity } from './types';

/** Report sections, in display order. Each asks one plain-language question. */
export const GROUPS: GroupMeta[] = [
  { id: 'ui', name: 'Frontend + backend', q: 'Can the screens reach the server?' },
  { id: 'data', name: 'Backend + database', q: 'Can the server store and read data?' },
  { id: 'hosting', name: 'Hosting', q: 'Can everything actually run where you host it?' },
  { id: 'auth', name: 'Sign-in', q: 'Can people log in securely?' },
  { id: 'ops', name: 'Shipping (DevOps)', q: 'Can you test and release changes?' },
  { id: 'addons', name: 'Add-ons', q: 'Do the plugged-in services fit?' },
];

/** Worst-wins ordering for severities. */
export const SEV_RANK: Record<Severity, number> = { block: 3, warn: 2, info: 1, ok: 0 };

/** Learning-curve labels mapped to a numeric weight for the difficulty estimate. */
export const CURVE: Record<string, number> = {
  Easy: 1,
  'Easy to moderate': 1.5,
  Moderate: 2,
  'Moderate to steep': 2.5,
  Steep: 3,
};

/** Score penalties per finding. Guidance, not a measurement. */
export const SCORE_WEIGHTS = { block: 25, warn: 8, info: 2, floor: 5 } as const;
