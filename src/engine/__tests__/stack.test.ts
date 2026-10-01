import { describe, expect, it } from 'vitest';
import {
  CORE_LAYERS,
  LAYER_ORDER,
  cloneStack,
  coreCount,
  emptyStack,
  isEmptyStack,
  isMultiLayer,
  normalizeStack,
  pickedIds,
  stackHas,
  toggleTool,
  withTool,
  withoutTool,
} from '../stack';

describe('layer order', () => {
  /* encode.ts depends on this order, so changing it breaks every shared link. */
  it('is the fixed eight, in the documented order', () => {
    expect([...LAYER_ORDER]).toEqual([
      'frontend',
      'mobile',
      'backend',
      'auth',
      'database',
      'hosting',
      'devops',
      'addons',
    ]);
  });

  it('treats devops and addons as the only multi-select layers', () => {
    const multi = LAYER_ORDER.filter(isMultiLayer);
    expect(multi).toEqual(['devops', 'addons']);
  });

  it('counts six core layers', () => {
    expect(CORE_LAYERS).toHaveLength(6);
    expect(CORE_LAYERS).not.toContain('mobile');
    expect(CORE_LAYERS).not.toContain('addons');
  });
});

describe('emptyStack', () => {
  it('starts with every layer empty', () => {
    const s = emptyStack();
    expect(isEmptyStack(s)).toBe(true);
    expect(pickedIds(s)).toEqual([]);
    expect(coreCount(s)).toBe(0);
  });

  it('returns a fresh object each time', () => {
    const a = emptyStack();
    a.devops.push('gha');
    expect(emptyStack().devops).toEqual([]);
  });
});

describe('withTool', () => {
  it('replaces the pick in a single-choice layer', () => {
    const s = withTool(withTool(emptyStack(), 'react'), 'vue');
    expect(s.frontend).toBe('vue');
  });

  it('appends in a multi-select layer', () => {
    const s = withTool(withTool(emptyStack(), 'gha'), 'docker');
    expect(s.devops).toEqual(['gha', 'docker']);
  });

  it('never adds the same tool twice', () => {
    const s = withTool(withTool(emptyStack(), 'gha'), 'gha');
    expect(s.devops).toEqual(['gha']);
  });

  it('ignores an unknown id', () => {
    expect(withTool(emptyStack(), 'nope')).toEqual(emptyStack());
  });

  it('does not mutate its input', () => {
    const s = emptyStack();
    withTool(s, 'react');
    expect(s.frontend).toBeNull();
  });
});

describe('withoutTool', () => {
  it('clears a single-choice layer only if that tool is the one set', () => {
    const s = withTool(emptyStack(), 'react');
    expect(withoutTool(s, 'react').frontend).toBeNull();
    expect(withoutTool(s, 'vue').frontend).toBe('react');
  });

  it('removes just the one entry from a multi-select layer', () => {
    const s = withTool(withTool(emptyStack(), 'gha'), 'docker');
    expect(withoutTool(s, 'gha').devops).toEqual(['docker']);
  });
});

describe('toggleTool', () => {
  it('adds then removes', () => {
    const on = toggleTool(emptyStack(), 'astro');
    expect(on.frontend).toBe('astro');
    expect(toggleTool(on, 'astro').frontend).toBeNull();
  });
});

describe('stackHas', () => {
  it('finds tools in both single and multi layers', () => {
    const s = withTool(withTool(emptyStack(), 'astro'), 'gha');
    expect(stackHas(s, 'astro')).toBe(true);
    expect(stackHas(s, 'gha')).toBe(true);
    expect(stackHas(s, 'vue')).toBe(false);
    expect(stackHas(s, 'nonexistent')).toBe(false);
  });
});

describe('pickedIds', () => {
  it('returns ids in layer order', () => {
    const s = normalizeStack({
      addons: ['tailwind'],
      frontend: 'nextjs',
      devops: ['gha'],
      database: 'neon',
    });
    expect(pickedIds(s)).toEqual(['nextjs', 'neon', 'gha', 'tailwind']);
  });
});

describe('coreCount', () => {
  it('counts filled core layers and ignores mobile and add-ons', () => {
    const s = normalizeStack({ frontend: 'nextjs', mobile: 'reactnative', addons: ['tailwind'] });
    expect(coreCount(s)).toBe(1);
  });

  it('counts a multi-select core layer once when non-empty', () => {
    expect(coreCount(normalizeStack({ devops: ['gha', 'docker'] }))).toBe(1);
  });
});

describe('normalizeStack', () => {
  it('fills in missing layers', () => {
    expect(normalizeStack({ frontend: 'react' })).toEqual({ ...emptyStack(), frontend: 'react' });
  });

  it('accepts null and undefined', () => {
    expect(normalizeStack(null)).toEqual(emptyStack());
    expect(normalizeStack(undefined)).toEqual(emptyStack());
  });

  it('repairs a multi-select layer that arrived as a single string', () => {
    const s = normalizeStack({ devops: 'gha' } as never);
    expect(s.devops).toEqual([]);
  });

  it('ignores an empty string in a single-choice layer', () => {
    expect(normalizeStack({ frontend: '' }).frontend).toBeNull();
  });

  it('copies arrays rather than sharing them', () => {
    const input = { devops: ['gha'] };
    const s = normalizeStack(input);
    s.devops.push('docker');
    expect(input.devops).toEqual(['gha']);
  });
});

describe('cloneStack', () => {
  it('produces an independent copy', () => {
    const s = normalizeStack({ frontend: 'react', devops: ['gha'] });
    const c = cloneStack(s);
    c.devops.push('docker');
    c.frontend = 'vue';
    expect(s.devops).toEqual(['gha']);
    expect(s.frontend).toBe('react');
  });
});
