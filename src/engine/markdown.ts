/**
 * A stack as plain Markdown, for pasting into a doc, issue or README.
 */
import type { Stack } from './types';
import { assess, verdictText } from './assess';
import { LAYER_ORDER, normalizeStack } from './stack';
import { nm } from './catalog';
import { layerName } from '../data/taxonomy';

/** Strips the inline <b>/<code> markup the findings carry. */
const plain = (html: string): string => html.replace(/<[^>]+>/g, '');

export function toMarkdown(input: Partial<Stack>, name: string): string {
  const s = normalizeStack(input);
  const a = assess(s);
  const lines: string[] = [`## ${name || 'Untitled'} stack`];

  for (const layer of LAYER_ORDER) {
    const v = s[layer];
    const names = Array.isArray(v) ? v.map(nm) : v ? [nm(v)] : [];
    if (names.length) lines.push(`- ${layerName(layer)}: ${names.join(', ')}`);
  }
  if (lines.length === 1) lines.push('- (nothing chosen yet)');

  if (a.verdict !== 'empty') {
    lines.push('', `Feasibility: ${verdictText(a)[0]} (${a.score}/100)`);
    for (const i of a.items) {
      if (i.severity === 'ok') continue;
      const label = i.severity === 'block' ? 'Blocker' : i.severity === 'warn' ? 'Caution' : 'Note';
      lines.push(`- ${label}: ${plain(i.message)}`);
    }
  }

  return lines.join('\n');
}
