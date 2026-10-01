/**
 * The test that matters most: every stack we advertise must still be feasible.
 *
 * Add a rule six months from now and this immediately tells you whether it
 * broke a recipe shown on the home page.
 */
import { describe, expect, it } from 'vitest';
import { assess } from '../assess';
import { normalizeStack, pickedIds } from '../stack';
import { encodeStack, decodeStack } from '../encode';
import { hasTool, tool } from '../catalog';
import type { Stack } from '../types';

interface Recipe {
  id: string;
  name: string;
  parts: string;
  stack: Stack;
  origin: string;
  goodFor: string;
  pros: string[];
  cons: string[];
}

const recipes = Object.values(
  import.meta.glob<Recipe>('../../content/recipes/*.json', { eager: true, import: 'default' }),
).sort((a, b) => a.id.localeCompare(b.id));

describe('recipe fixtures', () => {
  it('loads all 13 shipped recipes', () => {
    expect(recipes).toHaveLength(13);
  });
});

describe('every shipped recipe is feasible', () => {
  for (const r of recipes) {
    it(`${r.name} has no blockers`, () => {
      const a = assess(r.stack);
      const blockers = a.items.filter((i) => i.severity === 'block');
      // Name the offending rules so a failure is immediately actionable.
      expect(
        blockers.map((b) => `${b.rule}: ${b.message.replace(/<[^>]+>/g, '')}`),
        `${r.name} gained a blocker`,
      ).toEqual([]);
      expect(a.blocks).toBe(0);
    });
  }
});

describe('every shipped recipe is coherent', () => {
  for (const r of recipes) {
    it(`${r.name} references only real tools, in the right layers`, () => {
      for (const id of pickedIds(normalizeStack(r.stack))) {
        expect(hasTool(id), `${r.name}: unknown tool "${id}"`).toBe(true);
      }
      for (const [layer, v] of Object.entries(r.stack)) {
        for (const id of Array.isArray(v) ? v : v ? [v] : []) {
          expect(tool(id)?.layer, `${r.name}: ${id} is not a ${layer} tool`).toBe(layer);
        }
      }
    });

    it(`${r.name} survives a URL round-trip`, () => {
      expect(decodeStack(encodeStack(normalizeStack(r.stack)))).toEqual(normalizeStack(r.stack));
    });

    it(`${r.name} scores above the floor`, () => {
      const a = assess(r.stack);
      expect(a.score).toBeGreaterThan(5);
      expect(a.verdict).not.toBe('empty');
    });
  }
});
