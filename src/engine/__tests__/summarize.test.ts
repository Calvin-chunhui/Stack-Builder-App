import { describe, expect, it } from 'vitest';
import { summarize } from '../summarize';
import { suggestFixes } from '../suggest';
import { assess } from '../assess';
import { toMarkdown } from '../markdown';
import { emptyStack } from '../stack';
import type { Stack } from '../types';

const stack = (p: Partial<Stack>): Stack => ({ ...emptyStack(), ...p });

describe('summarize', () => {
  it('reports nothing for an empty stack', () => {
    const sm = summarize(emptyStack());
    expect(sm.parts).toBe(0);
    expect(sm.complexity).toBe('—');
    expect(sm.langs).toEqual([]);
  });

  it('lists the languages you actually write', () => {
    const sm = summarize(stack({ frontend: 'nextjs', database: 'postgres', devops: ['gha', 'docker'] }));
    expect(sm.langs).toContain('HTML & CSS');
    expect(sm.langs).toContain('JavaScript/TypeScript');
    expect(sm.langs).toContain('SQL');
    expect(sm.langs).toContain('YAML');
    expect(sm.langs).toContain('Dockerfile');
  });

  it('knows htmx means no JavaScript of your own', () => {
    const sm = summarize(stack({ frontend: 'htmx', backend: 'django' }));
    expect(sm.langs).toContain('HTML & CSS');
    expect(sm.langs).not.toContain('JavaScript/TypeScript');
    expect(sm.langs).toContain('Python');
  });

  it('adds HCL for infrastructure as code', () => {
    expect(summarize(stack({ devops: ['terraform'] })).langs).toContain('HCL');
  });

  it('rates a small single-language stack as the easiest', () => {
    const easy = summarize(stack({ frontend: 'vanilla', hosting: 'netlify' }));
    expect(easy.complexity).toBe('Beginner-friendly');
  });

  it('rates a big polyglot stack as advanced', () => {
    const hard = summarize(
      stack({
        frontend: 'angular',
        mobile: 'swiftui',
        backend: 'springboot',
        auth: 'keycloak',
        database: 'sqlserver',
        hosting: 'azure',
        devops: ['k8s', 'terraform', 'docker'],
      }),
    );
    expect(hard.complexity).toBe('Advanced');
  });

  it('says free tiers cover a stack built from free parts', () => {
    const sm = summarize(stack({ frontend: 'nextjs', database: 'neon', hosting: 'vercel', devops: ['gha'] }));
    expect(sm.paidNow).toEqual([]);
    expect(sm.startCost).toBe(0);
  });

  it('names the parts with no free tier and totals them', () => {
    // PlanetScale and Heroku both start paid.
    const sm = summarize(stack({ database: 'planetscale', hosting: 'heroku' }));
    expect(sm.paidNow).toEqual(['planetscale', 'heroku']);
    expect(sm.startCost).toBe(10);
  });

  it('flags usage-only pricing instead of inventing a monthly figure', () => {
    const sm = summarize(stack({ hosting: 'aws' }));
    expect(sm.usage).toBe(true);
  });

  it('collects per-use fees once each', () => {
    const sm = summarize(stack({ frontend: 'nextjs', addons: ['stripe', 'anthropic', 'openai'] }));
    expect(sm.fees).toContain('Stripe: 2.9% + 30¢ per US card charge');
    // openai and anthropic share the same fee wording, so it appears once.
    expect(sm.fees.filter((f) => f === 'AI models: pay per token')).toHaveLength(1);
  });

  it('counts store fees for mobile', () => {
    const sm = summarize(stack({ mobile: 'reactnative' }));
    expect(sm.fees.some((f) => f.includes('Apple'))).toBe(true);
  });
});

describe('suggestFixes', () => {
  it('returns nothing for a finding with no fix', () => {
    const a = assess(stack({ frontend: 'nextjs', hosting: 'vercel' }));
    const ok = a.items.find((i) => i.severity === 'ok' && !i.fix)!;
    expect(suggestFixes(stack({ frontend: 'nextjs', hosting: 'vercel' }), ok, a)).toEqual([]);
  });

  it('offers a straight removal when that is the fix', () => {
    const s = stack({ frontend: 'angular', addons: ['shadcn'] });
    const a = assess(s);
    const blocker = a.items.find((i) => i.fix?.remove)!;
    expect(suggestFixes(s, blocker, a)).toEqual([{ type: 'remove', id: 'shadcn' }]);
  });

  it('only offers swaps that genuinely improve the report', () => {
    const s = stack({ frontend: 'react', database: 'postgres' });
    const a = assess(s);
    const blocker = a.items.find((i) => i.severity === 'block')!;
    const fixes = suggestFixes(s, blocker, a);
    expect(fixes.length).toBeGreaterThan(0);
    for (const f of fixes) {
      if (f.type !== 'swap') continue;
      expect(f.blocks).toBeLessThanOrEqual(a.blocks);
    }
  });

  it('leads with the alsoRemove option when the framework has its own answer', () => {
    const s = stack({ backend: 'django', auth: 'betterauth' });
    const a = assess(s);
    const blocker = a.items.find((i) => i.rule === 'auth-library-needs-js-server')!;
    const fixes = suggestFixes(s, blocker, a);
    expect(fixes[0]).toMatchObject({ type: 'remove', id: 'betterauth' });
    expect(fixes[0]).toHaveProperty('note');
  });

  it('returns at most three suggestions', () => {
    const s = stack({ frontend: 'react', database: 'postgres' });
    const a = assess(s);
    const blocker = a.items.find((i) => i.severity === 'block')!;
    expect(suggestFixes(s, blocker, a).length).toBeLessThanOrEqual(3);
  });

  it('does not suggest a tool already in the stack', () => {
    const s = stack({ frontend: 'react', database: 'postgres' });
    const a = assess(s);
    const blocker = a.items.find((i) => i.severity === 'block')!;
    for (const f of suggestFixes(s, blocker, a)) {
      if (f.type === 'swap') expect(f.id).not.toBe('react');
    }
  });
});

describe('toMarkdown', () => {
  it('lists the picks and the verdict', () => {
    const md = toMarkdown(
      stack({ frontend: 'nextjs', database: 'neon', hosting: 'vercel', devops: ['gha'] }),
      'My app',
    );
    expect(md).toContain('## My app stack');
    expect(md).toContain('- Frontend: Next.js');
    expect(md).toContain('- DevOps: GitHub Actions');
    expect(md).toContain('Feasibility:');
  });

  it('carries no HTML through from the findings', () => {
    const md = toMarkdown(stack({ frontend: 'react', database: 'postgres' }), 'Broken');
    expect(md).not.toMatch(/<[a-z]/i);
    expect(md).toContain('Blocker:');
  });

  it('handles an empty stack', () => {
    expect(toMarkdown(emptyStack(), '')).toContain('(nothing chosen yet)');
  });
});
