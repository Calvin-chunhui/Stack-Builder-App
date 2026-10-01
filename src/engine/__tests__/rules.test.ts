/**
 * One test per rule group. Each case pins the behaviour that made the rule
 * worth writing, named by rule id so a failure points straight at the source.
 */
import { describe, expect, it } from 'vitest';
import { assess } from '../assess';
import { rules, ruleById } from '../rules';
import { emptyStack } from '../stack';
import type { Severity, Stack } from '../types';

const stack = (p: Partial<Stack>): Stack => ({ ...emptyStack(), ...p });

/** The findings a given rule produced for a stack. */
const firedBy = (s: Partial<Stack>, ruleId: string) =>
  assess(s).items.filter((i) => i.rule === ruleId);

const fired = (s: Partial<Stack>, ruleId: string) => firedBy(s, ruleId).length > 0;

const severityOf = (s: Partial<Stack>, ruleId: string): Severity | undefined =>
  firedBy(s, ruleId)[0]?.severity;

describe('rule declarations', () => {
  it('has unique ids', () => {
    const ids = rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('assigns every rule to a real group', () => {
    const groups = new Set(['ui', 'data', 'hosting', 'auth', 'ops', 'addons']);
    for (const r of rules) expect(groups.has(r.group), `${r.id} has group ${r.group}`).toBe(true);
  });

  it('can look a rule up by id', () => {
    expect(ruleById('auth-library-needs-js-server')?.group).toBe('auth');
    expect(ruleById('nope')).toBeUndefined();
  });

  it('returns nothing at all for an empty stack except the opening prompt', () => {
    const a = assess(emptyStack());
    expect(a.verdict).toBe('empty');
    expect(a.score).toBe(0);
    expect(a.items.map((i) => i.rule)).toContain('nothing-to-use-yet');
  });
});

/* ------------------------------------------------------------------ *
 * Frontend + backend
 * ------------------------------------------------------------------ */
describe('ui rules', () => {
  it('blocks a browser talking straight to a password-protected database', () => {
    const s = stack({ frontend: 'react', database: 'postgres' });
    expect(severityOf(s, 'ui-needs-somewhere-to-send-data')).toBe('block');
  });

  it('allows a client talking straight to a BaaS', () => {
    const s = stack({ frontend: 'react', database: 'supabase' });
    expect(severityOf(s, 'ui-needs-somewhere-to-send-data')).toBe('ok');
  });

  it('treats a meta-framework as having a server, so no blocker', () => {
    const s = stack({ frontend: 'nextjs', database: 'postgres' });
    expect(fired(s, 'ui-needs-somewhere-to-send-data')).toBe(false);
  });

  it('blocks htmx with no backend and warns with a JSON-only one', () => {
    expect(severityOf(stack({ frontend: 'htmx' }), 'htmx-needs-a-backend-that-returns-html')).toBe('block');
    expect(
      severityOf(stack({ frontend: 'htmx', backend: 'fastapi' }), 'htmx-needs-a-backend-that-returns-html'),
    ).toBe('warn');
    expect(
      severityOf(stack({ frontend: 'htmx', backend: 'django' }), 'htmx-needs-a-backend-that-returns-html'),
    ).toBe('ok');
  });

  it('counts the languages you have to learn', () => {
    const one = firedBy(stack({ frontend: 'nextjs', database: 'postgres' }), 'how-many-languages')[0];
    expect(one?.severity).toBe('ok');
    expect(one?.message).toContain('One programming language');

    const two = firedBy(stack({ frontend: 'react', backend: 'django' }), 'how-many-languages')[0];
    expect(two?.severity).toBe('info');
    expect(two?.message).toContain('2 programming languages');
  });

  it('recognises classic MERN', () => {
    const s = stack({ frontend: 'react', backend: 'express', database: 'mongodb' });
    expect(severityOf(s, 'classic-mern')).toBe('ok');
  });

  it('notes a single-platform mobile choice', () => {
    expect(severityOf(stack({ mobile: 'swiftui' }), 'mobile-covers-one-platform-only')).toBe('info');
    expect(fired(stack({ mobile: 'flutter' }), 'mobile-covers-one-platform-only')).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Backend + database
 * ------------------------------------------------------------------ */
describe('data rules', () => {
  it('warns that Redis is not a main database', () => {
    expect(severityOf(stack({ database: 'redis' }), 'database-is-a-helper-not-a-main-store')).toBe('warn');
  });

  it('warns when a SQL-first framework is pointed at MongoDB', () => {
    expect(severityOf(stack({ backend: 'django', database: 'mongodb' }), 'backend-database-fit')).toBe('warn');
    expect(severityOf(stack({ backend: 'express', database: 'mongodb' }), 'backend-database-fit')).toBe('ok');
  });

  it('calls out the known great pairings by name', () => {
    const f = firedBy(stack({ backend: 'django', database: 'postgres' }), 'backend-database-fit')[0];
    expect(f?.severity).toBe('ok');
    expect(f?.message).toContain('best-supported');
  });

  it('warns a server with no database at all', () => {
    expect(severityOf(stack({ backend: 'express' }), 'no-database-yet')).toBe('warn');
  });

  it('accepts a CMS instead of a database for a content site', () => {
    const s = stack({ frontend: 'astro', addons: ['sanity'] });
    expect(severityOf(s, 'no-database-yet')).toBe('ok');
  });
});

/* ------------------------------------------------------------------ *
 * Hosting
 * ------------------------------------------------------------------ */
describe('hosting rules', () => {
  it('blocks a language the host cannot run', () => {
    // Vercel runs JS, Python, Go and Ruby - but not Java.
    const f = firedBy(stack({ backend: 'springboot', hosting: 'vercel' }), 'host-runs-the-backend')[0];
    expect(f?.severity).toBe('block');
    expect(f?.message).toContain("can't run Java/Kotlin");
  });

  it('checks the language before the runtime shape', () => {
    // Cloudflare does support Python, so Django fails on the runtime instead:
    // it needs an always-on process, and Workers only run short-lived ones.
    const f = firedBy(stack({ backend: 'django', hosting: 'cloudflare' }), 'host-runs-the-backend')[0];
    expect(f?.severity).toBe('block');
    expect(f?.message).toContain('always-on server');
  });

  it('blocks an always-on framework on a functions-only host', () => {
    const f = firedBy(stack({ backend: 'rails', hosting: 'vercel' }), 'host-runs-the-backend')[0];
    expect(f?.severity).toBe('block');
    expect(f?.message).toContain('always-on server');
  });

  it('accepts an always-on host for the same framework', () => {
    expect(severityOf(stack({ backend: 'rails', hosting: 'fly' }), 'host-runs-the-backend')).toBe('ok');
  });

  it('blocks a SQLite file on a host with no lasting disk', () => {
    expect(severityOf(stack({ database: 'sqlite', hosting: 'vercel' }), 'host-can-reach-the-database')).toBe(
      'block',
    );
  });

  it('accepts SQLite on Cloudflare, which offers D1', () => {
    expect(severityOf(stack({ database: 'sqlite', hosting: 'cloudflare' }), 'host-can-reach-the-database')).toBe(
      'ok',
    );
  });

  it('recognises managed database offerings', () => {
    const f = firedBy(stack({ database: 'postgres', hosting: 'render' }), 'host-can-reach-the-database')[0];
    expect(f?.severity).toBe('ok');
    expect(f?.message).toContain('managed');
  });

  it('warns when a cloud-native database sits in a different cloud', () => {
    expect(severityOf(stack({ database: 'dynamodb', hosting: 'gcp' }), 'host-can-reach-the-database')).toBe(
      'warn',
    );
    expect(severityOf(stack({ database: 'dynamodb', hosting: 'aws' }), 'host-can-reach-the-database')).toBe('ok');
  });

  it('praises the zero-config Next.js + Vercel path', () => {
    expect(severityOf(stack({ frontend: 'nextjs', hosting: 'vercel' }), 'host-runs-the-frontend')).toBe('ok');
  });

  it('warns Keycloak cannot live on a serverless host', () => {
    expect(severityOf(stack({ auth: 'keycloak', hosting: 'vercel' }), 'keycloak-needs-a-long-running-host')).toBe(
      'warn',
    );
    expect(fired(stack({ auth: 'keycloak', hosting: 'fly' }), 'keycloak-needs-a-long-running-host')).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Sign-in
 * ------------------------------------------------------------------ */
describe('auth rules', () => {
  /* This is the rule the build plan singles out. */
  it('blocks a JS-only auth library in front of a non-JS server', () => {
    const f = firedBy(stack({ backend: 'django', auth: 'betterauth' }), 'auth-library-needs-js-server')[0];
    expect(f?.severity).toBe('block');
    expect(f?.message).toContain('JavaScript or TypeScript server');
    // Django has its own accounts, so the fix offers to drop the library.
    expect(f?.fix?.alsoRemove).toBe('betterauth');
    expect(f?.fix?.layer).toBe('auth');
  });

  it('accepts the same library on a JS server', () => {
    expect(
      severityOf(stack({ frontend: 'nextjs', auth: 'betterauth', database: 'neon' }), 'auth-library-needs-js-server'),
    ).toBe('ok');
  });

  it('warns a session library with no database to store users in', () => {
    expect(
      severityOf(stack({ frontend: 'nextjs', auth: 'betterauth' }), 'auth-library-needs-a-supported-database'),
    ).toBe('warn');
  });

  it('warns about a database the auth library has no adapter for', () => {
    expect(
      severityOf(
        stack({ frontend: 'nextjs', auth: 'betterauth', database: 'dynamodb' }),
        'auth-library-needs-a-supported-database',
      ),
    ).toBe('warn');
  });

  it('flags Auth.js as maintenance-only', () => {
    expect(severityOf(stack({ frontend: 'nextjs', auth: 'authjs' }), 'authjs-is-in-maintenance-mode')).toBe('warn');
  });

  it('links tied auth and database products', () => {
    expect(
      severityOf(stack({ frontend: 'react', auth: 'supabaseauth', database: 'supabase' }), 'auth-tied-to-one-database'),
    ).toBe('ok');
    expect(
      severityOf(stack({ frontend: 'react', auth: 'supabaseauth', database: 'neon' }), 'auth-tied-to-one-database'),
    ).toBe('info');
  });

  it('suggests an auth provider that suits the stack', () => {
    const f = firedBy(stack({ frontend: 'nextjs', database: 'postgres' }), 'no-sign-in-yet')[0];
    expect(f?.message).toContain('Clerk or Better Auth');
  });

  it('says nothing when the framework already ships accounts', () => {
    const f = firedBy(stack({ frontend: 'htmx', backend: 'django', database: 'postgres' }), 'no-sign-in-yet')[0];
    expect(f?.severity).toBe('ok');
    expect(f?.message).toContain('includes');
  });
});

/* ------------------------------------------------------------------ *
 * Shipping
 * ------------------------------------------------------------------ */
describe('ops rules', () => {
  it('nudges towards CI once a stack has substance', () => {
    expect(fired(stack({ frontend: 'react' }), 'no-ci-yet')).toBe(false);
    expect(
      fired(stack({ frontend: 'react', backend: 'express', database: 'postgres', hosting: 'render' }), 'no-ci-yet'),
    ).toBe(true);
  });

  it('notes two CI tools doing one job', () => {
    expect(severityOf(stack({ devops: ['gha', 'circleci'] }), 'more-than-one-ci-tool')).toBe('info');
    expect(severityOf(stack({ devops: ['gha'] }), 'ci-covers-this-stack')).toBe('ok');
  });

  it('warns Kubernetes is redundant on a managed host', () => {
    expect(severityOf(stack({ devops: ['k8s'], hosting: 'vercel' }), 'kubernetes-fit')).toBe('warn');
  });

  it('pairs Docker with Kubernetes happily on raw infrastructure', () => {
    const f = firedBy(stack({ devops: ['k8s', 'docker'], hosting: 'aws' }), 'kubernetes-fit');
    expect(f.some((x) => x.severity === 'ok')).toBe(true);
  });

  it('notes Terraform and OpenTofu overlap', () => {
    expect(severityOf(stack({ devops: ['terraform', 'opentofu'] }), 'terraform-and-opentofu-overlap')).toBe('info');
  });

  it('notes Ansible has nothing to configure on serverless', () => {
    expect(severityOf(stack({ devops: ['ansible'], hosting: 'vercel' }), 'ansible-without-servers-to-configure')).toBe(
      'info',
    );
  });
});

/* ------------------------------------------------------------------ *
 * Add-ons
 * ------------------------------------------------------------------ */
describe('addon rules', () => {
  it('blocks a React-only component kit on a non-React frontend', () => {
    const f = firedBy(stack({ frontend: 'angular', addons: ['shadcn'] }), 'addon-requirements')[0];
    expect(f?.severity).toBe('block');
    expect(f?.fix?.remove).toBe('shadcn');
  });

  it('softens to a warning where community ports exist', () => {
    expect(severityOf(stack({ frontend: 'vue', addons: ['shadcn'] }), 'addon-requirements')).toBe('warn');
  });

  it('blocks a JS-only ORM on a Python server and names the alternative', () => {
    const f = firedBy(stack({ backend: 'django', addons: ['prisma'] }), 'addon-requirements')[0];
    expect(f?.severity).toBe('block');
    expect(f?.message).toContain('Django ORM');
  });

  it('blocks an ORM that does not support the chosen database', () => {
    const f = firedBy(
      stack({ frontend: 'nextjs', database: 'dynamodb', addons: ['drizzle'] }),
      'addon-requirements',
    )[0];
    expect(f?.severity).toBe('block');
  });

  it('requires TypeScript on both ends for tRPC', () => {
    expect(severityOf(stack({ frontend: 'nextjs', addons: ['trpc'] }), 'addon-requirements')).toBe('ok');
    expect(severityOf(stack({ frontend: 'htmx', backend: 'django', addons: ['trpc'] }), 'addon-requirements')).toBe(
      'block',
    );
  });

  it('warns a secret key has nowhere safe to live', () => {
    expect(severityOf(stack({ frontend: 'react', addons: ['stripe'] }), 'addon-requirements')).toBe('warn');
    expect(severityOf(stack({ frontend: 'nextjs', addons: ['stripe'] }), 'addon-requirements')).toBe('ok');
  });

  it('blocks a long-running service on a functions-only host', () => {
    const f = firedBy(stack({ hosting: 'vercel', addons: ['prometheus'] }), 'addon-requirements')[0];
    expect(f?.severity).toBe('block');
    expect(f?.message).toContain('Grafana Cloud');
  });

  it('spots two tools doing the same job', () => {
    const f = firedBy(stack({ frontend: 'nextjs', addons: ['prisma', 'drizzle'] }), 'overlapping-addons');
    expect(f[0]?.message).toContain('both ORMs');
  });

  it('suggests pgvector instead of a separate vector database', () => {
    const f = firedBy(
      stack({ frontend: 'nextjs', database: 'neon', addons: ['pinecone'] }),
      'overlapping-addons',
    )[0];
    expect(f?.message).toContain('pgvector');
  });
});

/* ------------------------------------------------------------------ *
 * Verdict arithmetic
 * ------------------------------------------------------------------ */
describe('verdict and score', () => {
  it('reports block when anything blocks', () => {
    const a = assess(stack({ frontend: 'react', database: 'postgres' }));
    expect(a.verdict).toBe('block');
    expect(a.blocks).toBeGreaterThan(0);
  });

  it('sorts worst findings first', () => {
    const a = assess(stack({ frontend: 'angular', database: 'postgres', addons: ['shadcn'] }));
    const rank = { block: 3, warn: 2, info: 1, ok: 0 };
    const seq = a.items.map((i) => rank[i.severity]);
    expect([...seq].sort((x, y) => y - x)).toEqual(seq);
  });

  it('never scores below the floor', () => {
    const a = assess(
      stack({
        frontend: 'angular',
        database: 'sqlite',
        hosting: 'vercel',
        auth: 'betterauth',
        addons: ['shadcn', 'prisma', 'trpc', 'prometheus'],
      }),
    );
    expect(a.score).toBeGreaterThanOrEqual(5);
  });

  it('marks untouched groups as none, not ok', () => {
    const a = assess(stack({ frontend: 'react' }));
    expect(a.groupStatus.ops).toBe('none');
  });

  it('is deterministic', () => {
    const s = stack({ frontend: 'nextjs', database: 'neon', hosting: 'vercel', devops: ['gha'] });
    expect(assess(s)).toEqual(assess(s));
  });

  it('does not mutate the stack it is given', () => {
    const s = stack({ frontend: 'nextjs', devops: ['gha'], addons: ['tailwind'] });
    const before = structuredClone(s);
    assess(s);
    expect(s).toEqual(before);
  });
});
