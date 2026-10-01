/**
 * The product's brain. Framework-free: nothing in src/engine imports Astro,
 * React or the DOM, so it runs in the build, the browser and Vitest alike.
 */
export { assess, verdictText, buildContext, GROUPS } from './assess';
export { suggestFixes } from './suggest';
export { summarize } from './summarize';
export { encodeStack, decodeStack, isDecodable, shareUrl, cleanName, NAME_MAX } from './encode';
export { toMarkdown } from './markdown';
export { rules, ruleById, isServerful } from './rules';
export { COMPAT } from './compat.generated';
export { SEV_RANK, CURVE, SCORE_WEIGHTS } from './groups';
export {
  LAYER_ORDER,
  CORE_LAYERS,
  emptyStack,
  normalizeStack,
  cloneStack,
  stackHas,
  withTool,
  withoutTool,
  toggleTool,
  pickedIds,
  coreCount,
  isEmptyStack,
  isMultiLayer,
} from './stack';
export { TOOLS, tool, nm, toolsInLayer, hasTool, matches } from './catalog';
export type {
  Assessment,
  CatalogTool,
  CompatAttrs,
  Finding,
  Fix,
  FixSuggestion,
  GroupId,
  GroupMeta,
  LayerId,
  MultiLayerId,
  Rule,
  RuleContext,
  RuleFinding,
  RunTarget,
  Severity,
  SingleLayerId,
  Stack,
  Summary,
  Verdict,
} from './types';
