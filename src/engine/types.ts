/**
 * Engine types. No framework imports anywhere in src/engine.
 */

export type LayerId =
  | 'frontend'
  | 'mobile'
  | 'backend'
  | 'auth'
  | 'database'
  | 'hosting'
  | 'devops'
  | 'addons';

/** Layers that hold a list rather than a single choice. */
export type MultiLayerId = 'devops' | 'addons';
export type SingleLayerId = Exclude<LayerId, MultiLayerId>;

export interface Stack {
  frontend: string | null;
  mobile: string | null;
  backend: string | null;
  auth: string | null;
  database: string | null;
  hosting: string | null;
  devops: string[];
  addons: string[];
}

export type Severity = 'block' | 'warn' | 'info' | 'ok';

/** Verdict for a whole stack. `empty` means nothing has been picked yet. */
export type Verdict = 'empty' | 'block' | 'warn' | 'ok';

export type GroupId = 'ui' | 'data' | 'hosting' | 'auth' | 'ops' | 'addons';

/** How a finding can be acted on. */
export interface Fix {
  /** Offer replacements from this layer. */
  layer?: LayerId;
  /** Offer to drop this exact tool. */
  remove?: string;
  /** Drop this tool as well as swapping (e.g. use the framework's own auth). */
  alsoRemove?: string;
  note?: string;
}

export interface Finding {
  severity: Severity;
  group: GroupId;
  /** Tools this finding is about, for cross-linking. */
  ids: string[];
  /** Message body. Contains inline <b> and <code> markup only. */
  message: string;
  fix?: Fix;
  /** Which rule produced it. Makes failures traceable in tests. */
  rule: string;
}

export interface GroupMeta {
  id: GroupId;
  name: string;
  /** The plain-language question this group answers. */
  q: string;
}

export interface Assessment {
  items: Finding[];
  blocks: number;
  warns: number;
  infos: number;
  verdict: Verdict;
  /** 0-100. Guidance, not a measurement. */
  score: number;
  groupStatus: Record<GroupId, Severity | 'none'>;
}

export type FixSuggestion =
  | { type: 'remove'; id: string; note?: string }
  | { type: 'swap'; id: string; blocks: number; warns: number; infos: number; popularity: number };

export interface Summary {
  langs: string[];
  complexity: string;
  /** Tools with no free tier at all. */
  paidNow: string[];
  startCost: number;
  /** Rough monthly total of entry plans once free tiers are outgrown. */
  later: number;
  /** True when at least one part is purely usage-priced. */
  usage: boolean;
  fees: string[];
  parts: number;
}

/* ---------------------------------------------------------------- *
 * Compatibility attributes
 * ---------------------------------------------------------------- */

export type RunTarget = 'static' | 'serverless' | 'edge' | 'server' | 'container';

export interface CompatAttrs {
  /** Programming language key, see LANG in src/data/taxonomy. */
  lang?: string;

  // Frontend
  /** Rendering shape: spa | meta | islands | html | static */
  r?: 'spa' | 'meta' | 'islands' | 'html' | 'static';
  /** Ships its own server routes. */
  srv?: boolean;
  /** Is React, or renders React components. */
  react?: boolean;

  // Mobile
  os?: string[];

  // Backend
  runs?: RunTarget[] | 'any';
  /** Can render HTML server-side (matters for htmx). */
  html?: boolean;
  mongo?: 'native' | 'adapter' | 'poor';
  /** The idiomatic data-access layer, named in report copy. */
  orm?: string;
  /** Built-in user accounts, named in report copy. */
  auth?: string;

  // Auth
  kind?: 'hosted' | 'library' | 'baas' | 'selfhost' | 'ci' | 'container' | 'orchestrator' | 'iac' | 'config';
  sdk?: 'any' | string[];
  mobile?: boolean;
  needsDb?: boolean;
  /** Auth that shares a project with one specific database. */
  tied?: string;

  // Database
  model?: 'sql' | 'document' | 'kv' | 'search';
  conn?: 'tcp' | 'http' | 'embedded' | 'sdk';
  /** SQL dialects / drivers, used to match ORMs. */
  dia?: string[];
  /** Can serve as the main store. */
  primary?: boolean;
  /** Safe to use from short-lived functions. */
  sls?: boolean;
  baas?: boolean;
  /** Sold as a managed service. */
  dbaas?: boolean;
  /** Only exists inside this cloud. */
  where?: string;

  // Hosting
  langs?: 'any' | string[];
  /** Databases this host offers as a managed add-on. */
  managed?: string[];
  /** Has a first-party Terraform provider. */
  tf?: boolean;
  provider?: string;

  // Add-ons
  needs?: 'frontend' | 'react' | 'server' | 'js-server' | 'ts-both' | 'selfhost' | 'any';
}

/**
 * The tool facts the engine and the builder UI need: a deliberately small
 * subset of the content record, so the browser bundle stays light.
 */
export interface CatalogTool {
  id: string;
  name: string;
  /** Two-letter monogram shown when there is no logo. */
  monogram: string;
  layer: LayerId;
  /** Add-ons only. */
  category?: string;
  subtitle: string;
  /** Short "what it's for" line on the picker tiles. */
  tagline: string;
  learningCurve: string;
  /** Share of developers who used it in the past year, for ranking swaps. */
  popularity: number;
  pricing: {
    freeTier: boolean;
    entryMonthly: number | null;
    usageFee?: string;
  };
  /** Pre-lowercased searchable text, built at generation time. */
  haystack: string;
}

/**
 * Everything a rule can read besides the stack itself: lookups plus the
 * handful of facts derived from the whole stack that most rules need.
 */
export interface RuleContext {
  /** Compatibility attributes for a tool id; {} when unknown or null. */
  compat: (id: string | null | undefined) => CompatAttrs;
  /** Display name for a tool id. Falls back to the id. */
  name: (id: string) => string;
  tool: (id: string) => CatalogTool | undefined;

  /** Compat shorthands for the single-choice layers. */
  F: CompatAttrs;
  M: CompatAttrs;
  B: CompatAttrs;
  A: CompatAttrs;
  D: CompatAttrs;
  H: CompatAttrs;

  /** Anything that can run trusted server code: a backend, or a meta-framework. */
  hasServer: boolean;
  /** Language of that server code, or null when there is no server. */
  serverLanguage: string | null;
  /** Shorthand for serverLanguage === 'js'. */
  jsServer: boolean;
  /** The database is a backend-as-a-service a client may talk to directly. */
  isBaaS: boolean;
  hostRuns: RunTarget[];
  /** Frontend or mobile - something a person can actually use. */
  anyUI: string | null;
  /** Number of the six core layers that are filled. */
  coreCount: number;
  pickedCount: number;
  /** A language key mapped to its display label, e.g. js -> JavaScript/TypeScript. */
  lang: (key: string | null | undefined) => string;
  /** True when the host can keep a process alive (server or container). */
  serverful: boolean;
}

/** What a rule returns: one finding, several, or nothing to say. */
export type RuleFinding = {
  severity: Severity;
  message: string;
  ids?: string[];
  fix?: Fix;
};
export type RuleResult = RuleFinding | RuleFinding[] | null;

export interface Rule {
  /** Stable, human-readable id. Used in tests and in Finding.rule. */
  id: string;
  group: GroupId;
  check: (s: Stack, ctx: RuleContext) => RuleResult;
}
