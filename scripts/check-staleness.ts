/**
 * Data freshness report.
 *
 *   node scripts/check-staleness.ts              human-readable report
 *   node scripts/check-staleness.ts --markdown   body for a GitHub issue
 *   node scripts/check-staleness.ts --fail       exit 1 if anything is stale
 *
 * Prices go out of date faster than anything else on the site, which is the
 * whole reason this exists. It reads the content files directly, so it needs
 * no build and no Astro.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS_DIR = join(ROOT, 'src/content/tools');

/** A record is stale this many days after it was last verified. */
const STALE_AFTER_DAYS = 90;
const DAY_MS = 86_400_000;

interface Tool {
  id: string;
  name: string;
  layer: string;
  pricing: { lastVerified: string; sourceUrl: string; freeTier: boolean; entryMonthly: number | null };
  version: { label: string; lastVerified: string };
  notableUsers: { name: string; sourceUrl?: string }[];
  pairsWith: { toolId: string; reason: string; resolved: boolean }[];
  surveys?: { source: string };
}

const args = new Set(process.argv.slice(2));
const asMarkdown = args.has('--markdown');
const failOnStale = args.has('--fail');

const tools: Tool[] = readdirSync(TOOLS_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(TOOLS_DIR, f), 'utf8')) as Tool)
  .sort((a, b) => a.id.localeCompare(b.id));

const today = new Date();
const ageInDays = (iso: string): number =>
  Math.floor((today.getTime() - new Date(iso).getTime()) / DAY_MS);

interface Stale {
  id: string;
  name: string;
  layer: string;
  what: 'pricing' | 'version';
  days: number;
  lastVerified: string;
  sourceUrl: string;
}

const stale: Stale[] = [];
for (const t of tools) {
  const priceAge = ageInDays(t.pricing.lastVerified);
  if (priceAge > STALE_AFTER_DAYS) {
    stale.push({
      id: t.id,
      name: t.name,
      layer: t.layer,
      what: 'pricing',
      days: priceAge,
      lastVerified: t.pricing.lastVerified,
      sourceUrl: t.pricing.sourceUrl,
    });
  }
  const versionAge = ageInDays(t.version.lastVerified);
  if (versionAge > STALE_AFTER_DAYS) {
    stale.push({
      id: t.id,
      name: t.name,
      layer: t.layer,
      what: 'version',
      days: versionAge,
      lastVerified: t.version.lastVerified,
      sourceUrl: t.pricing.sourceUrl,
    });
  }
}

/* Data-quality gaps that are not about age. */
const uncitedUsers = tools
  .filter((t) => t.notableUsers.some((u) => !u.sourceUrl))
  .map((t) => ({
    id: t.id,
    name: t.name,
    missing: t.notableUsers.filter((u) => !u.sourceUrl).map((u) => u.name),
  }));

const unresolvedPairs = tools
  .filter((t) => t.pairsWith.some((p) => !p.resolved))
  .map((t) => ({
    id: t.id,
    name: t.name,
    targets: t.pairsWith.filter((p) => !p.resolved).map((p) => p.toolId),
  }));

const stalest = [...stale].sort((a, b) => b.days - a.days);
const priceCount = stale.filter((s) => s.what === 'pricing').length;
const versionCount = stale.filter((s) => s.what === 'version').length;

if (asMarkdown) {
  const lines: string[] = [];
  lines.push(`Checked ${tools.length} tool records on ${today.toISOString().slice(0, 10)}.`);
  lines.push('');

  if (!stale.length) {
    lines.push(`Nothing is past its ${STALE_AFTER_DAYS}-day verification window.`);
  } else {
    lines.push(
      `**${stale.length} record${stale.length === 1 ? '' : 's'} past the ${STALE_AFTER_DAYS}-day window** ` +
        `(${priceCount} pricing, ${versionCount} version).`,
    );
    lines.push('');
    lines.push('| Tool | Layer | Field | Last verified | Days | Source |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const s of stalest) {
      lines.push(
        `| [${s.name}](src/content/tools/${s.id}.json) | ${s.layer} | ${s.what} | ` +
          `${s.lastVerified} | ${s.days} | [check](${s.sourceUrl}) |`,
      );
    }
    lines.push('');
    lines.push('To clear an entry: confirm the figure on the vendor page, update the value if it');
    lines.push("changed, and set that field's `lastVerified` to today.");
  }

  if (uncitedUsers.length) {
    lines.push('');
    lines.push(`<details><summary>${uncitedUsers.length} records list users without a citation</summary>`);
    lines.push('');
    for (const u of uncitedUsers) lines.push(`- **${u.name}**: ${u.missing.join(', ')}`);
    lines.push('');
    lines.push('</details>');
  }

  console.log(lines.join('\n'));
} else {
  console.log(`Checked ${tools.length} tool records against a ${STALE_AFTER_DAYS}-day window.\n`);

  if (!stale.length) {
    console.log('  All pricing and version figures are within the window.');
  } else {
    console.log(`  ${stale.length} stale (${priceCount} pricing, ${versionCount} version):\n`);
    for (const s of stalest) {
      console.log(
        `    ${String(s.days).padStart(4)}d  ${s.what.padEnd(7)}  ${s.id.padEnd(16)} ${s.sourceUrl}`,
      );
    }
  }

  if (uncitedUsers.length) {
    const total = uncitedUsers.reduce((n, u) => n + u.missing.length, 0);
    console.log(`\n  ${total} notable users across ${uncitedUsers.length} records have no sourceUrl.`);
  }
  if (unresolvedPairs.length) {
    const total = unresolvedPairs.reduce((n, p) => n + p.targets.length, 0);
    console.log(
      `  ${total} pairsWith entries name something with no page of its own ` +
        '(expected: e.g. "Vite", "TypeScript").',
    );
  }
  console.log('');
}

if (failOnStale && stale.length) process.exit(1);
