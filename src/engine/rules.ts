/**
 * The feasibility rules. These *are* the product.
 *
 * Each rule is small, named and independently testable. A rule reads the stack
 * plus the derived facts on RuleContext and returns nothing, one finding, or
 * several. Rules never mutate anything and never import a framework.
 *
 * Order matters only for presentation: findings of equal severity keep the
 * order the rules are declared in, because assess() uses a stable sort.
 *
 * Severity:
 *   block - won't work as-is        warn - works, with care
 *   info  - worth knowing           ok   - a good fit
 */
import type { Rule, RuleFinding, RunTarget, Stack } from './types';

/** A host that can keep a process alive, as opposed to short-lived functions. */
export const isServerful = (targets: readonly RunTarget[] | string[]): boolean =>
  targets.includes('server') || targets.includes('container');

/** Drops empty layer slots, so a finding only ever names real tools. */
const toolIds = (...xs: (string | null | undefined)[]): string[] =>
  xs.filter((x): x is string => Boolean(x));

const CLOUD_NAMES: Record<string, string> = { aws: 'AWS', gcp: 'Google Cloud', azure: 'Azure' };
const hostName = (w: string): string => CLOUD_NAMES[w] ?? w;

/** Hosts that already run the app for you, making Kubernetes redundant. */
const MANAGED_HOSTS = ['vercel', 'netlify', 'render', 'railway', 'fly', 'heroku', 'cloudflare'];

/** Databases Better Auth and friends have no official adapter for. */
const NO_AUTH_ADAPTER = ['firestore', 'dynamodb', 'redis', 'elasticsearch'];

export const rules: Rule[] = [
  /* ================================================================ *
   * Frontend + backend
   * ================================================================ */
  {
    id: 'nothing-to-use-yet',
    group: 'ui',
    check: (s, ctx) => {
      if (ctx.anyUI || s.backend) return null;
      return {
        severity: 'info',
        message: '<b>Nothing for people to use yet.</b> Pick a frontend (website) or a mobile app.',
        fix: { layer: 'frontend' },
      };
    },
  },
  {
    id: 'api-without-screens',
    group: 'ui',
    check: (s, ctx) => {
      if (ctx.anyUI || !s.backend) return null;
      return {
        severity: 'info',
        ids: [s.backend],
        message:
          "<b>This is an API with no screens.</b> That's fine for a service other apps call; add a frontend if people will use it directly.",
      };
    },
  },
  {
    id: 'ui-needs-somewhere-to-send-data',
    group: 'ui',
    check: (s, ctx) => {
      const ui = ctx.anyUI;
      if (!ui || ctx.hasServer) return null;

      if (ctx.isBaaS && s.database) {
        const guard = s.database === 'firestore' ? 'Security Rules' : 'Row Level Security';
        return {
          severity: 'ok',
          ids: [ui, s.database],
          message: `<b>${ctx.name(ui)} talks to ${ctx.name(s.database)} directly</b> through its SDK, protected by ${guard}. No separate backend needed to start.`,
        };
      }
      if (s.database) {
        return {
          severity: 'block',
          ids: [ui, s.database],
          message: `<b>${ctx.name(ui)} can't safely talk to ${ctx.name(s.database)} by itself.</b> Browsers and phones can't be trusted with database passwords. Add a backend, or pick a backend-as-a-service like Supabase or Firebase.`,
          fix: { layer: 'backend' },
        };
      }
      if (s.mobile) {
        return {
          severity: 'warn',
          ids: [s.mobile],
          message:
            '<b>The mobile app has nowhere to save data.</b> Add a backend or a backend-as-a-service (Supabase, Firebase) for accounts and syncing.',
          fix: { layer: 'database' },
        };
      }
      if (s.frontend && ctx.F.r !== 'html') {
        return {
          severity: 'info',
          ids: [s.frontend],
          message:
            '<b>Right now this is a static site:</b> great for pages that look the same for everyone. Add a backend or Supabase when you need accounts or saved data.',
        };
      }
      return null;
    },
  },
  {
    id: 'htmx-needs-a-backend-that-returns-html',
    group: 'ui',
    check: (s, ctx) => {
      if (!s.frontend || ctx.F.r !== 'html') return null;
      if (!s.backend) {
        return {
          severity: 'block',
          ids: [s.frontend],
          message:
            '<b>htmx needs a backend that returns HTML.</b> Pair it with Django, Rails, Laravel, Flask or Go.',
          fix: { layer: 'backend' },
        };
      }
      if (!ctx.B.html) {
        return {
          severity: 'warn',
          ids: [s.frontend, s.backend],
          message: `<b>${ctx.name(s.backend)} is built for JSON APIs,</b> while htmx expects HTML back. Django, Rails, Laravel, Flask or Go fit better.`,
          fix: { layer: 'backend' },
        };
      }
      return {
        severity: 'ok',
        ids: [s.frontend, s.backend],
        message: `<b>htmx and ${ctx.name(s.backend)} fit well:</b> the server renders HTML pieces and htmx swaps them into the page.`,
      };
    },
  },
  {
    id: 'meta-framework-makes-backend-optional',
    group: 'ui',
    check: (s, ctx) => {
      if (!(s.frontend && ctx.F.srv && s.backend)) return null;
      return {
        severity: 'info',
        ids: [s.frontend, s.backend],
        message: `<b>${ctx.name(s.frontend)} already has server routes,</b> so a separate ${ctx.name(s.backend)} back end is optional. It's worth it if you want a different language or one API shared with a mobile app.`,
      };
    },
  },
  {
    id: 'mobile-calls-the-api',
    group: 'ui',
    check: (s, ctx) => {
      if (s.frontend || !s.backend || !ctx.hasServer || ctx.F.srv || !s.mobile) return null;
      return {
        severity: 'ok',
        ids: [s.mobile, s.backend],
        message: `<b>${ctx.name(s.mobile)} calls your ${ctx.name(s.backend)} API</b> over HTTPS, like any other client.`,
      };
    },
  },
  {
    id: 'frontend-calls-the-api',
    group: 'ui',
    check: (s, ctx) => {
      if (!(s.frontend && s.backend && !ctx.F.srv && ctx.F.r !== 'html')) return null;
      return {
        severity: 'ok',
        ids: [s.frontend, s.backend],
        message: `<b>${ctx.name(s.frontend)} calls your ${ctx.name(s.backend)} API</b> from the browser, usually with JSON.`,
      };
    },
  },
  {
    id: 'mobile-covers-one-platform-only',
    group: 'ui',
    check: (s, ctx) => {
      if (!s.mobile || !ctx.M.os || ctx.M.os.length !== 1) return null;
      const platform = ctx.M.os[0] === 'ios' ? 'iPhone and iPad' : 'Android';
      return {
        severity: 'info',
        ids: [s.mobile],
        message: `<b>${ctx.name(s.mobile)} only builds for ${platform}.</b> Reaching both means a second app, or a cross-platform tool like React Native or Flutter.`,
      };
    },
  },
  {
    id: 'react-native-shares-react-skills',
    group: 'ui',
    check: (s, ctx) => {
      if (s.mobile !== 'reactnative' || !ctx.F.react || !s.frontend) return null;
      return {
        severity: 'ok',
        ids: [s.mobile, s.frontend],
        message: `<b>React Native and ${ctx.name(s.frontend)}</b> share the same React skills, and some code can be shared.`,
      };
    },
  },
  {
    id: 'classic-mern',
    group: 'ui',
    check: (s) => {
      if (!(s.frontend === 'react' && s.backend === 'express' && s.database === 'mongodb')) return null;
      return {
        severity: 'ok',
        ids: [s.frontend, s.backend, s.database],
        message: '<b>Classic MERN:</b> one language from database to screen.',
      };
    },
  },
  {
    id: 'how-many-languages',
    group: 'ui',
    check: (s, ctx) => {
      const langs = [
        s.frontend && ctx.F.lang,
        s.mobile && ctx.M.lang,
        s.backend && ctx.B.lang,
      ].filter((x): x is string => Boolean(x));
      const unique = [...new Set(langs)];

      if (unique.length === 1 && ctx.anyUI && (ctx.hasServer || ctx.isBaaS)) {
        return {
          severity: 'ok',
          message: `<b>One programming language</b> (${ctx.lang(unique[0])}) across the app, so there's less to learn.`,
        };
      }
      if (unique.length >= 2) {
        return {
          severity: 'info',
          message: `<b>${unique.length} programming languages</b> (${unique.map((l) => ctx.lang(l)).join(', ')}). Very common, but more to learn and hire for.`,
        };
      }
      return null;
    },
  },

  /* ================================================================ *
   * Backend + database
   * ================================================================ */
  {
    id: 'no-database-yet',
    group: 'data',
    check: (s, ctx) => {
      if (!ctx.hasServer || s.database) return null;
      if (s.backend) {
        return {
          severity: 'warn',
          ids: [s.backend],
          message:
            "<b>No database yet,</b> so the app can't remember anything between visits. PostgreSQL is the usual first choice.",
          fix: { layer: 'database' },
        };
      }
      const cms = s.addons.find((a) => ctx.tool(a)?.category === 'cms');
      if (cms) {
        return {
          severity: 'ok',
          ids: toolIds(s.frontend, cms),
          message: `<b>${ctx.name(cms)} stores your content,</b> so a content site doesn't need its own database. Add one when you need accounts or user data.`,
        };
      }
      return {
        severity: 'info',
        ids: toolIds(s.frontend),
        message:
          '<b>No database yet.</b> That\'s fine for content sites; add one when you need accounts or saved user data.',
        fix: { layer: 'database' },
      };
    },
  },
  {
    id: 'database-is-a-helper-not-a-main-store',
    group: 'data',
    check: (s, ctx) => {
      if (!s.database || ctx.D.primary !== false) return null;
      const detail =
        s.database === 'redis'
          ? "It keeps data in memory for speed; pair it with PostgreSQL or similar for anything you can't lose."
          : 'It powers search next to a main database like PostgreSQL.';
      return {
        severity: 'warn',
        ids: [s.database],
        message: `<b>${ctx.name(s.database)} is a helper, not a main database.</b> ${detail}`,
        fix: { layer: 'database' },
      };
    },
  },
  {
    id: 'backend-database-fit',
    group: 'data',
    check: (s, ctx) => {
      if (!s.backend || !s.database || ctx.D.primary === false) return null;
      const ids = [s.backend, s.database];
      const dia = ctx.D.dia ?? [];

      if (dia.includes('mongo')) {
        if (ctx.B.mongo === 'native') {
          return {
            severity: 'ok',
            ids,
            message: `<b>${ctx.name(s.backend)} works well with MongoDB</b> through its official driver.`,
          };
        }
        if (ctx.B.mongo === 'adapter') {
          return {
            severity: 'warn',
            ids,
            message: `<b>${ctx.name(s.backend)} is built around SQL databases.</b> MongoDB works through extra packages, but you lose parts of ${ctx.B.orm}. PostgreSQL is the smoother path.`,
            fix: { layer: 'database' },
          };
        }
        return {
          severity: 'warn',
          ids,
          message: `<b>${ctx.name(s.backend)} has no well-maintained MongoDB support</b> in ${ctx.B.orm}. PostgreSQL is the standard choice.`,
          fix: { layer: 'database' },
        };
      }

      if (ctx.D.conn === 'sdk') {
        if (ctx.B.auth) {
          return {
            severity: 'warn',
            ids,
            message: `<b>${ctx.name(s.database)} doesn't plug into ${ctx.B.orm}.</b> You'd call its SDK directly and lose the framework's database features. A SQL database suits ${ctx.name(s.backend)} better.`,
            fix: { layer: 'database' },
          };
        }
        return {
          severity: 'ok',
          ids,
          message: `<b>${ctx.name(s.backend)} can use ${ctx.name(s.database)}</b> through the official SDK.`,
        };
      }

      if (ctx.D.model === 'sql') {
        const special: Record<string, string> = {
          'django|postgres': "PostgreSQL is Django's best-supported database.",
          'rails|sqlite': 'Rails 8 made SQLite production-ready.',
          'phoenix|postgres': "PostgreSQL is Phoenix's default database through Ecto.",
          'aspnet|sqlserver': 'SQL Server and ASP.NET Core are a classic Microsoft pairing.',
        };
        const note = special[`${s.backend}|${s.database}`];
        return {
          severity: 'ok',
          ids,
          message: note
            ? `<b>Great fit:</b> ${note}`
            : `<b>${ctx.name(s.backend)} and ${ctx.name(s.database)}</b> work together through ${ctx.B.orm}.`,
        };
      }
      return null;
    },
  },
  {
    id: 'meta-framework-queries-the-database',
    group: 'data',
    check: (s, ctx) => {
      if (s.backend || !s.frontend || !ctx.F.srv || !s.database) return null;
      if (ctx.D.baas || ctx.D.primary === false) return null;
      const ids = [s.frontend, s.database];
      if (ctx.D.model === 'sql') {
        return {
          severity: 'ok',
          ids,
          message: `<b>${ctx.name(s.frontend)}'s server code can query ${ctx.name(s.database)},</b> usually through an ORM like Prisma or Drizzle.`,
        };
      }
      return {
        severity: 'ok',
        ids,
        message: `<b>${ctx.name(s.frontend)}'s server code can use ${ctx.name(s.database)}</b> through its JavaScript SDK or driver.`,
      };
    },
  },

  /* ================================================================ *
   * Hosting
   * ================================================================ */
  {
    id: 'no-hosting-yet',
    group: 'hosting',
    check: (s, ctx) => {
      if (s.hosting) return null;
      if (ctx.hasServer || s.frontend) {
        return {
          severity: 'info',
          message: '<b>No hosting picked yet.</b> Choose where the app will run.',
          fix: { layer: 'hosting' },
        };
      }
      if (s.mobile && ctx.isBaaS && s.database) {
        return {
          severity: 'ok',
          ids: [s.mobile, s.database],
          message: `<b>No hosting needed to start:</b> people install the app from a store, and ${ctx.name(s.database)} runs the backend part for you.`,
        };
      }
      return null;
    },
  },
  {
    id: 'host-runs-the-backend',
    group: 'hosting',
    check: (s, ctx) => {
      if (!s.hosting || !s.backend) return null;
      const backendRuns = (ctx.B.runs === 'any' ? [] : ctx.B.runs) ?? [];
      const overlap = backendRuns.filter((r) => ctx.hostRuns.includes(r));
      const ids = [s.hosting, s.backend];

      // "any" means the host runs arbitrary languages (a VM or container).
      const hostLangs: string[] | 'any' = ctx.H.langs ?? [];
      const langOk = hostLangs === 'any' || hostLangs.includes(ctx.B.lang ?? '');

      if (!langOk) {
        const supported = (hostLangs as string[]).map((l) => ctx.lang(l)).join(', ');
        return {
          severity: 'block',
          ids,
          message: `<b>${ctx.name(s.hosting)} can't run ${ctx.lang(ctx.B.lang)}.</b> It supports ${supported}.`,
          fix: { layer: 'hosting' },
        };
      }
      if (!overlap.length) {
        const shortLived = ctx.hostRuns.filter((r) => r !== 'static').join(' and ');
        return {
          severity: 'block',
          ids,
          message: `<b>${ctx.name(s.backend)} needs an always-on server,</b> but ${ctx.name(s.hosting)} only runs short-lived ${shortLived} functions.`,
          fix: { layer: 'hosting' },
        };
      }
      if (!isServerful(overlap)) {
        return {
          severity: 'warn',
          ids,
          message: `<b>${ctx.name(s.hosting)} runs ${ctx.name(s.backend)} as short-lived functions:</b> fine for simple APIs, but no WebSockets, background jobs or long tasks.`,
          fix: { layer: 'hosting' },
        };
      }
      return {
        severity: 'ok',
        ids,
        message: `<b>${ctx.name(s.hosting)} can run ${ctx.name(s.backend)}</b> as an always-on ${overlap.includes('server') ? 'server' : 'container'}.`,
      };
    },
  },
  {
    id: 'cloudflare-workers-are-not-full-node',
    group: 'hosting',
    check: (s, ctx) => {
      if (s.hosting !== 'cloudflare' || !s.backend) return null;
      if (!['express', 'nestjs', 'node'].includes(s.backend)) return null;
      const hostLangs = ctx.H.langs;
      const langOk = hostLangs === 'any' || (hostLangs ?? []).includes(ctx.B.lang ?? '');
      if (!langOk) return null;
      return {
        severity: 'info',
        ids: [s.hosting, s.backend],
        message:
          "<b>Workers aren't full Node.js.</b> Express-style apps may need compatibility flags or a Workers-native framework like Hono.",
      };
    },
  },
  {
    id: 'host-does-not-serve-static-files',
    group: 'hosting',
    check: (s, ctx) => {
      if (!s.hosting || !s.backend || !s.frontend) return null;
      if (ctx.F.srv || ctx.hostRuns.includes('static')) return null;
      return {
        severity: 'info',
        ids: [s.hosting, s.frontend],
        message: `<b>${ctx.name(s.hosting)} doesn't serve static sites on its own.</b> Serve ${ctx.name(s.frontend)}'s files from your backend, or put them on a free static host like Cloudflare or Netlify.`,
      };
    },
  },
  {
    id: 'host-runs-the-frontend',
    group: 'hosting',
    check: (s, ctx) => {
      if (!s.hosting || !s.frontend || s.backend) return null;
      const ids = [s.frontend, s.hosting];
      const fe = s.frontend;
      const ho = s.hosting;

      if (fe === 'nextjs' && ho === 'vercel') {
        return { severity: 'ok', ids, message: '<b>Next.js and Vercel</b> deploy together with zero configuration.' };
      }
      if (fe === 'nextjs' && ho === 'cloudflare') {
        return {
          severity: 'info',
          ids,
          message:
            '<b>Next.js runs on Cloudflare through the OpenNext adapter;</b> a few features behave differently than on Vercel.',
        };
      }
      if (fe === 'nextjs' && isServerful(ctx.hostRuns)) {
        return {
          severity: 'info',
          ids,
          message: `<b>Next.js runs on ${ctx.name(ho)} as a Node server;</b> caching and image features take more setup than on Vercel.`,
        };
      }
      if (fe === 'astro' && ho === 'cloudflare') {
        return {
          severity: 'ok',
          ids,
          message:
            '<b>Astro on Cloudflare</b> is first-class since Astro 6; the Astro team now works at Cloudflare.',
        };
      }
      if (ctx.F.srv) {
        return {
          severity: 'ok',
          ids,
          message: `<b>${ctx.name(fe)} deploys to ${ctx.name(ho)}</b> with an official adapter.`,
        };
      }
      if (ctx.F.r !== 'html') {
        return {
          severity: 'ok',
          ids,
          message: `<b>${ctx.name(fe)} builds to static files,</b> which ${ctx.name(ho)} can serve.`,
        };
      }
      return null;
    },
  },
  {
    id: 'host-can-reach-the-database',
    group: 'hosting',
    check: (s, ctx) => {
      if (!s.hosting || !s.database) return null;
      const ids = [s.database, s.hosting];
      const db = s.database;
      const ho = s.hosting;
      const dia = ctx.D.dia ?? [];

      if (ctx.D.conn === 'embedded') {
        if (ho === 'cloudflare') {
          return {
            severity: 'ok',
            ids,
            message: '<b>Cloudflare D1 is hosted SQLite,</b> so this pairing works well.',
          };
        }
        if (!ctx.serverful) {
          return {
            severity: 'block',
            ids,
            message: `<b>A SQLite file won't persist on ${ctx.name(ho)},</b> because functions have no lasting disk. Use Turso or another hosted database.`,
            fix: { layer: 'database' },
          };
        }
        return {
          severity: 'info',
          ids,
          message: `<b>SQLite needs a persistent disk (a volume) on ${ctx.name(ho)}.</b> Back it up with a tool like Litestream.`,
        };
      }

      if (ctx.D.where && ctx.D.where !== ctx.H.provider) {
        return {
          severity: 'warn',
          ids,
          message: `<b>${ctx.name(db)} lives in ${hostName(ctx.D.where)}.</b> It works from ${ctx.name(ho)}, but you'll manage access keys and extra network delay.`,
          fix: { layer: 'hosting' },
        };
      }
      if (ctx.D.where && ctx.D.where === ctx.H.provider) {
        return {
          severity: 'ok',
          ids,
          message: `<b>${ctx.name(db)} is native to ${ctx.name(ho)},</b> so access and billing live in one place.`,
        };
      }
      if ((ctx.H.managed ?? []).includes(db)) {
        const via = ['vercel', 'netlify'].includes(ho) ? ' through its marketplace' : '';
        return {
          severity: 'ok',
          ids,
          message: `<b>${ctx.name(ho)} offers managed ${ctx.name(db)}${via},</b> with backups handled for you.`,
        };
      }
      if (ctx.D.dbaas) {
        if (!ctx.serverful && !ctx.D.sls) {
          return {
            severity: 'info',
            ids,
            message: `<b>${ctx.name(db)} works from ${ctx.name(ho)}'s functions,</b> but reuse connections carefully so short-lived functions don't open too many.`,
          };
        }
        return {
          severity: 'ok',
          ids,
          message: `<b>${ctx.name(db)} is a hosted service,</b> so it works from ${ctx.name(ho)} over the internet.`,
        };
      }
      if (ho === 'cloudflare') {
        return {
          severity: 'warn',
          ids,
          message: `<b>Workers need Hyperdrive or an HTTP driver to reach ${ctx.name(db)}.</b> A serverless-friendly option like Neon or Turso is simpler.`,
          fix: { layer: 'database' },
        };
      }
      if (!ctx.serverful) {
        const friendly = dia.includes('mysql') ? 'PlanetScale' : 'Neon or Supabase';
        return {
          severity: 'warn',
          ids,
          message: `<b>${ctx.name(ho)} doesn't run databases,</b> and short-lived functions struggle with ${ctx.name(db)}'s connection limits. Use a serverless-friendly provider like ${friendly}.`,
          fix: { layer: 'database' },
        };
      }
      const alt = dia.includes('pg') ? ', or use a hosted provider like Neon or Supabase' : '';
      return {
        severity: 'info',
        ids,
        message: `<b>${ctx.name(ho)} doesn't offer managed ${ctx.name(db)}.</b> Run it yourself in a container${alt}.`,
      };
    },
  },
  {
    id: 'keycloak-needs-a-long-running-host',
    group: 'hosting',
    check: (s, ctx) => {
      if (!s.hosting || s.auth !== 'keycloak' || ctx.serverful) return null;
      return {
        severity: 'warn',
        ids: [s.auth, s.hosting],
        message: `<b>Keycloak must run on a server or container host;</b> it can't run on ${ctx.name(s.hosting)}. Host it separately, or pick a hosted auth service.`,
        fix: { layer: 'auth' },
      };
    },
  },
  {
    id: 'cognito-fits-aws-best',
    group: 'hosting',
    check: (s) => {
      if (!s.hosting || s.auth !== 'cognito' || s.hosting === 'aws') return null;
      return {
        severity: 'info',
        ids: [s.auth, s.hosting],
        message: '<b>Cognito lives in AWS.</b> It works from anywhere but fits best with AWS hosting.',
      };
    },
  },

  /* ================================================================ *
   * Sign-in
   * ================================================================ */
  {
    id: 'no-sign-in-yet',
    group: 'auth',
    check: (s, ctx) => {
      if (s.auth || !ctx.anyUI || !(ctx.hasServer || ctx.isBaaS)) return null;
      if (s.backend && ctx.B.auth) {
        return {
          severity: 'ok',
          ids: [s.backend],
          message: `<b>No auth service picked, and that's fine:</b> ${ctx.name(s.backend)} includes ${ctx.B.auth}.`,
        };
      }
      let suggestion = 'Better Auth or Auth0';
      if (s.database === 'supabase') suggestion = 'Supabase Auth';
      else if (s.database === 'firestore') suggestion = 'Firebase Auth';
      else if (s.backend === 'springboot' || s.frontend === 'angular') suggestion = 'Keycloak or Auth0';
      else if (s.frontend === 'nextjs') suggestion = 'Clerk or Better Auth';
      else if (s.backend && !ctx.jsServer) suggestion = 'Auth0 or WorkOS';
      return {
        severity: 'info',
        message: `<b>No sign-in yet.</b> ${suggestion} would fit this stack.`,
        fix: { layer: 'auth' },
      };
    },
  },
  {
    id: 'auth-library-needs-js-server',
    group: 'auth',
    check: (s, ctx) => {
      if (!s.auth || ctx.A.kind !== 'library') return null;
      const host = s.backend || s.frontend;
      if (ctx.jsServer) {
        return {
          severity: 'ok',
          ids: toolIds(s.auth, host),
          message: `<b>${ctx.name(s.auth)} runs inside your ${ctx.name(host!)} server</b> and keeps users in your own database.`,
        };
      }
      const detail = s.backend
        ? `${ctx.name(s.backend)} uses ${ctx.lang(ctx.B.lang)}${ctx.B.auth ? ` and already includes ${ctx.B.auth}` : ''}. Use that, or a hosted service like Auth0.`
        : 'Add a JS/TS backend or a framework with server routes, like Next.js.';
      return {
        severity: 'block',
        ids: toolIds(s.auth, host),
        message: `<b>${ctx.name(s.auth)} runs inside a JavaScript or TypeScript server.</b> ${detail}`,
        fix:
          s.backend && ctx.B.auth
            ? { layer: 'auth', alsoRemove: s.auth, note: `use ${ctx.name(s.backend)}'s built-in accounts` }
            : { layer: 'auth' },
      };
    },
  },
  {
    id: 'auth-library-needs-a-supported-database',
    group: 'auth',
    check: (s, ctx) => {
      if (!s.auth || ctx.A.kind !== 'library' || !ctx.A.needsDb || !ctx.jsServer) return null;
      if (!s.database) {
        return {
          severity: 'warn',
          ids: [s.auth],
          message: `<b>${ctx.name(s.auth)} needs a database</b> to store users and sessions.`,
          fix: { layer: 'database' },
        };
      }
      if (NO_AUTH_ADAPTER.includes(s.database)) {
        return {
          severity: 'warn',
          ids: [s.auth, s.database],
          message: `<b>${ctx.name(s.auth)} has no official adapter for ${ctx.name(s.database)}.</b> PostgreSQL, MySQL, SQLite or MongoDB work.`,
          fix: { layer: 'database' },
        };
      }
      return null;
    },
  },
  {
    id: 'auth-library-is-web-only',
    group: 'auth',
    check: (s, ctx) => {
      if (!s.auth || ctx.A.kind !== 'library' || !s.mobile || ctx.A.mobile) return null;
      return {
        severity: 'warn',
        ids: [s.auth, s.mobile],
        message: `<b>${ctx.name(s.auth)} is built for web apps;</b> mobile sign-in needs extra work.`,
        fix: { layer: 'auth' },
      };
    },
  },
  {
    id: 'auth-service-sdk-language',
    group: 'auth',
    check: (s, ctx) => {
      if (!s.auth || ctx.A.kind === 'library') return null;
      const sdk = ctx.A.sdk;
      if (ctx.serverLanguage && sdk !== 'any' && !(sdk ?? []).includes(ctx.serverLanguage)) {
        return {
          severity: 'info',
          ids: toolIds(s.auth, s.backend),
          message: `<b>No official ${ctx.name(s.auth)} SDK for ${ctx.lang(ctx.serverLanguage)}.</b> You can still verify its tokens (JWTs) with a standard library.`,
        };
      }
      if (ctx.A.kind !== 'baas') {
        const partner = s.backend || s.frontend || s.mobile;
        if (!partner) return null;
        return {
          severity: 'ok',
          ids: [s.auth, partner],
          message: `<b>${ctx.name(s.auth)} works with ${ctx.name(partner)}</b>${s.backend ? ' through its SDK or standard tokens' : ''}.`,
        };
      }
      return null;
    },
  },
  {
    id: 'auth-service-mobile-support',
    group: 'auth',
    check: (s, ctx) => {
      if (!s.auth || ctx.A.kind === 'library' || !s.mobile || ctx.A.mobile !== false) return null;
      return {
        severity: 'warn',
        ids: [s.auth, s.mobile],
        message: `<b>${ctx.name(s.auth)} has limited mobile support.</b> Clerk, Auth0, Supabase Auth or Firebase Auth have native mobile SDKs.`,
        fix: { layer: 'auth' },
      };
    },
  },
  {
    id: 'auth-tied-to-one-database',
    group: 'auth',
    check: (s, ctx) => {
      if (!s.auth || !ctx.A.tied) return null;
      if (s.database === ctx.A.tied) {
        return {
          severity: 'ok',
          ids: [s.auth, s.database],
          message: `<b>${ctx.name(s.auth)} and ${ctx.name(s.database)} share one project,</b> so access rules can check who's signed in.`,
        };
      }
      if (s.database) {
        return {
          severity: 'info',
          ids: [s.auth, s.database],
          message: `<b>${ctx.name(s.auth)} works with ${ctx.name(s.database)}</b> by verifying its tokens, but you lose the built-in link to ${ctx.name(ctx.A.tied)}'s access rules.`,
        };
      }
      return {
        severity: 'info',
        ids: [s.auth],
        message: `<b>${ctx.name(s.auth)} is usually paired with ${ctx.name(ctx.A.tied)}</b> as the database.`,
        fix: { layer: 'database' },
      };
    },
  },
  {
    id: 'authjs-is-in-maintenance-mode',
    group: 'auth',
    check: (s) => {
      if (s.auth !== 'authjs') return null;
      return {
        severity: 'warn',
        ids: [s.auth],
        message:
          '<b>Auth.js is in maintenance mode.</b> Its maintainers recommend Better Auth for new projects.',
        fix: { layer: 'auth' },
      };
    },
  },
  {
    id: 'clerk-has-a-first-class-nextjs-sdk',
    group: 'auth',
    check: (s) => {
      if (s.auth !== 'clerk' || s.frontend !== 'nextjs') return null;
      return {
        severity: 'ok',
        ids: [s.auth, s.frontend],
        message: '<b>Clerk has a first-class Next.js SDK</b> with ready-made sign-in components.',
      };
    },
  },
  {
    id: 'backend-already-has-auth',
    group: 'auth',
    check: (s, ctx) => {
      if (!s.auth || !s.backend || !ctx.B.auth || ctx.A.kind === 'library') return null;
      return {
        severity: 'info',
        ids: [s.auth, s.backend],
        message: `<b>${ctx.name(s.backend)} also has ${ctx.B.auth}.</b> Using ${ctx.name(s.auth)} instead is fine; just don't run both.`,
      };
    },
  },

  /* ================================================================ *
   * Shipping (DevOps)
   * ================================================================ */
  {
    id: 'no-ci-yet',
    group: 'ops',
    check: (s, ctx) => {
      if (s.devops.length || ctx.coreCount < 3) return null;
      return {
        severity: 'info',
        message:
          '<b>No CI/CD yet.</b> Automatic tests catch bugs before users do; GitHub Actions is free for public repos.',
        fix: { layer: 'devops' },
      };
    },
  },
  {
    id: 'more-than-one-ci-tool',
    group: 'ops',
    check: (s, ctx) => {
      const ci = s.devops.filter((o) => ctx.compat(o).kind === 'ci');
      if (ci.length <= 1) return null;
      return {
        severity: 'info',
        ids: ci,
        message: `<b>${ci.map((c) => ctx.name(c)).join(' and ')} both run CI.</b> One is usually enough.`,
      };
    },
  },
  {
    id: 'ci-covers-this-stack',
    group: 'ops',
    check: (s, ctx) => {
      const ci = s.devops.filter((o) => ctx.compat(o).kind === 'ci');
      if (ci.length !== 1) return null;
      return {
        severity: 'ok',
        ids: ci,
        message: `<b>${ctx.name(ci[0])} can test and deploy this stack;</b> it works with any host.`,
      };
    },
  },
  {
    id: 'jenkins-needs-its-own-server',
    group: 'ops',
    check: (s) => {
      if (!s.devops.includes('jenkins')) return null;
      return {
        severity: 'info',
        ids: ['jenkins'],
        message: '<b>Jenkins needs its own server</b> that you keep patched.',
      };
    },
  },
  {
    id: 'kubernetes-fit',
    group: 'ops',
    check: (s, ctx) => {
      if (!s.devops.includes('k8s')) return null;
      const out: RuleFinding[] = [];
      if (s.hosting && MANAGED_HOSTS.includes(s.hosting)) {
        out.push({
          severity: 'warn' as const,
          ids: ['k8s', s.hosting],
          message: `<b>${ctx.name(s.hosting)} already runs your app for you,</b> so Kubernetes is redundant here.`,
          fix: { remove: 'k8s' },
        });
      } else if (!s.devops.includes('docker')) {
        out.push({
          severity: 'info' as const,
          ids: ['k8s'],
          message: '<b>Kubernetes runs container images;</b> add Docker or another builder to produce them.',
        });
      } else {
        out.push({
          severity: 'ok' as const,
          ids: ['k8s', 'docker'],
          message: '<b>Docker builds the images</b> that Kubernetes runs.',
        });
      }
      if (ctx.pickedCount <= 6) {
        out.push({
          severity: 'info' as const,
          ids: ['k8s'],
          message: '<b>Kubernetes is powerful but heavy.</b> Many teams wait until they run several services.',
        });
      }
      return out;
    },
  },
  {
    id: 'docker-and-the-host',
    group: 'ops',
    check: (s, ctx) => {
      if (!s.devops.includes('docker') || !s.hosting) return null;
      if (!ctx.serverful) {
        return {
          severity: 'info',
          ids: ['docker', s.hosting],
          message: `<b>${ctx.name(s.hosting)} doesn't run your Docker containers.</b> Docker still helps for local development and CI.`,
        };
      }
      return {
        severity: 'ok',
        ids: ['docker', s.hosting],
        message: `<b>${ctx.name(s.hosting)} can deploy your Docker image.</b>`,
      };
    },
  },
  {
    id: 'iac-provider-for-the-host',
    group: 'ops',
    check: (s, ctx) => {
      if (!s.hosting) return null;
      const iac = s.devops.filter((o) => ctx.compat(o).kind === 'iac');
      return iac.map((o) =>
        ctx.H.tf
          ? {
              severity: 'ok' as const,
              ids: [o, s.hosting!],
              message: `<b>${ctx.name(o)} can manage ${ctx.name(s.hosting!)} resources</b> as code.`,
            }
          : {
              severity: 'info' as const,
              ids: [o, s.hosting!],
              message: `<b>No official ${ctx.name(o)} provider for ${ctx.name(s.hosting!)};</b> you'd rely on community providers.`,
            },
      );
    },
  },
  {
    id: 'terraform-and-opentofu-overlap',
    group: 'ops',
    check: (s) => {
      if (!(s.devops.includes('terraform') && s.devops.includes('opentofu'))) return null;
      return {
        severity: 'info',
        ids: ['terraform', 'opentofu'],
        message: '<b>Terraform and OpenTofu do the same job.</b> Pick one.',
      };
    },
  },
  {
    id: 'ansible-without-servers-to-configure',
    group: 'ops',
    check: (s, ctx) => {
      if (!s.devops.includes('ansible') || !s.hosting || ctx.serverful) return null;
      return {
        severity: 'info',
        ids: ['ansible', s.hosting],
        message: `<b>Ansible configures servers,</b> and ${ctx.name(s.hosting)} doesn't give you any to manage.`,
        fix: { remove: 'ansible' },
      };
    },
  },

  /* ================================================================ *
   * Add-ons
   * ================================================================ */
  {
    id: 'addon-requirements',
    group: 'addons',
    check: (s, ctx) => {
      const out: RuleFinding[] = [];
      for (const a of s.addons) {
        const X = ctx.compat(a);
        const n = ctx.name(a);

        if (X.needs === 'frontend') {
          if (s.frontend) {
            out.push({ severity: 'ok', ids: [a, s.frontend], message: `<b>${n} works with ${ctx.name(s.frontend)}.</b>` });
          } else if (a === 'tailwind' && s.mobile === 'reactnative') {
            out.push({
              severity: 'info',
              ids: [a, s.mobile],
              message: '<b>On React Native, Tailwind works through NativeWind.</b>',
            });
          } else {
            out.push({
              severity: 'info',
              ids: [a],
              message: `<b>${n} is for a web frontend;</b> pick one to use it.`,
              fix: { layer: 'frontend' },
            });
          }
        }

        if (X.needs === 'react') {
          if (ctx.F.react && s.frontend) {
            out.push({ severity: 'ok', ids: [a, s.frontend], message: `<b>${n} works with ${ctx.name(s.frontend)}.</b>` });
          } else if (s.frontend && ['vue', 'svelte', 'solid'].includes(s.frontend)) {
            out.push({
              severity: 'warn',
              ids: [a, s.frontend],
              message: `<b>${n} is built for React.</b> Community ports exist for ${ctx.name(s.frontend)}, but they lag behind.`,
              fix: { remove: a },
            });
          } else if (s.frontend) {
            out.push({
              severity: 'block',
              ids: [a, s.frontend],
              message: `<b>${n} needs React</b> and won't work with ${ctx.name(s.frontend)}.`,
              fix: { remove: a },
            });
          } else {
            out.push({
              severity: 'info',
              ids: [a],
              message: `<b>${n} needs a React frontend.</b>`,
              fix: { layer: 'frontend' },
            });
          }
        }

        if (X.needs === 'js-server') {
          if (!ctx.jsServer) {
            const detail =
              s.backend && ctx.B.orm && ['prisma', 'drizzle'].includes(a)
                ? `With ${ctx.name(s.backend)}, use ${ctx.B.orm} instead.`
                : s.backend
                  ? `${ctx.name(s.backend)} uses ${ctx.lang(ctx.B.lang)}.`
                  : 'Add a JS/TS backend or a framework like Next.js.';
            out.push({
              severity: 'block',
              ids: toolIds(a, s.backend),
              message: `<b>${n} runs in JavaScript or TypeScript server code.</b> ${detail}`,
              fix: { remove: a },
            });
          } else if (X.dia) {
            if (!s.database) {
              out.push({
                severity: 'info',
                ids: [a],
                message: `<b>${n} needs a database</b> to talk to.`,
                fix: { layer: 'database' },
              });
            } else if (!(ctx.D.dia ?? []).some((d) => X.dia!.includes(d))) {
              out.push({
                severity: 'block',
                ids: [a, s.database],
                message: `<b>${n} doesn't support ${ctx.name(s.database)}.</b>`,
                fix: { remove: a },
              });
            } else if ((ctx.D.dia ?? []).includes('mongo') && a === 'prisma') {
              out.push({
                severity: 'info',
                ids: [a, s.database],
                message: "<b>Prisma's MongoDB support is less complete</b> than its SQL support.",
              });
            } else {
              out.push({ severity: 'ok', ids: [a, s.database], message: `<b>${n} supports ${ctx.name(s.database)}.</b>` });
            }
          } else {
            const host = s.backend || s.frontend;
            out.push({
              severity: 'ok',
              ids: toolIds(a, host),
              message: `<b>${n} runs in your ${ctx.name(host!)} server code.</b>`,
            });
          }
        }

        if (X.needs === 'ts-both') {
          const tsFront =
            (s.frontend && ctx.F.lang === 'js' && ctx.F.r !== 'html') || (s.mobile && ctx.M.lang === 'js');
          if (!ctx.jsServer || !tsFront) {
            out.push({
              severity: 'block',
              ids: [a],
              message:
                '<b>tRPC needs TypeScript on both the frontend and the server.</b> Use REST or GraphQL for mixed languages.',
              fix: { remove: a },
            });
          } else {
            out.push({
              severity: 'ok',
              ids: [a],
              message: '<b>tRPC connects your TypeScript frontend and server</b> with shared types.',
            });
          }
        }

        if (X.needs === 'server') {
          if (!ctx.hasServer) {
            if (ctx.isBaaS && s.database) {
              const where =
                s.database === 'supabase'
                  ? 'Supabase Edge Functions'
                  : s.database === 'firestore'
                    ? 'Firebase Cloud Functions'
                    : 'A small serverless function';
              out.push({
                severity: 'warn',
                ids: [a, s.database],
                message: `<b>${n} needs a secret key kept on a server.</b> ${where} can hold it.`,
              });
            } else {
              out.push({
                severity: 'warn',
                ids: [a],
                message: `<b>${n} needs a secret key kept on a server,</b> and this stack has no backend. Add one, or use a framework with server routes like Next.js.`,
                fix: { layer: 'backend' },
              });
            }
          } else if (X.langs && X.langs !== 'any' && !X.langs.includes(ctx.serverLanguage ?? '')) {
            out.push({
              severity: 'warn',
              ids: toolIds(a, s.backend),
              message: `<b>${n} only has official libraries for ${(X.langs as string[]).map((l) => ctx.lang(l)).join(' and ')}.</b>`,
              fix: { remove: a },
            });
          } else {
            const host = s.backend || s.frontend;
            out.push({
              severity: 'ok',
              ids: toolIds(a, host),
              message: `<b>${n} is called from your ${ctx.name(host!)} server,</b> where its secret key stays safe.`,
            });
          }
        }

        if (X.needs === 'selfhost') {
          if (!s.hosting) {
            out.push({
              severity: 'info',
              ids: [a],
              message: `<b>${n} needs a server to run on.</b>`,
              fix: { layer: 'hosting' },
            });
          } else if (!ctx.serverful) {
            const alt =
              a === 'prometheus'
                ? 'Use Grafana Cloud, Datadog or Sentry instead.'
                : 'Host it on Render, Railway or Strapi Cloud.';
            out.push({
              severity: 'block',
              ids: [a, s.hosting],
              message: `<b>${n} is a long-running service and can't run on ${ctx.name(s.hosting)}.</b> ${alt}`,
              fix: { remove: a },
            });
          } else {
            out.push({
              severity: 'ok',
              ids: [a, s.hosting],
              message: `<b>${n} can run on ${ctx.name(s.hosting)}</b> as its own service.`,
            });
          }
          if (a === 'strapi' && s.database && !['postgres', 'mysql', 'mariadb', 'sqlite'].includes(s.database)) {
            out.push({
              severity: 'info',
              ids: [a, s.database],
              message: '<b>Strapi needs PostgreSQL, MySQL, MariaDB or SQLite.</b>',
            });
          }
        }

        if (X.needs === 'any') {
          if (a === 'datadog' && s.hosting && !ctx.serverful) {
            out.push({
              severity: 'info',
              ids: [a, s.hosting],
              message: '<b>Datadog shines with servers and containers.</b> For serverless apps, Sentry may be simpler.',
            });
          } else {
            out.push({ severity: 'ok', ids: [a], message: `<b>${n} works with any stack</b> through its SDK.` });
          }
        }
      }
      return out;
    },
  },
  {
    id: 'overlapping-addons',
    group: 'addons',
    check: (s, ctx) => {
      const out: RuleFinding[] = [];
      const pair = (x: string, y: string, message: string) => {
        if (s.addons.includes(x) && s.addons.includes(y)) {
          out.push({ severity: 'info' as const, ids: [x, y], message });
        }
      };
      pair('prisma', 'drizzle', '<b>Prisma and Drizzle are both ORMs.</b> Pick one.');
      pair('stripe', 'paddle', '<b>Stripe and Paddle both take payments.</b> Most apps use one.');
      pair('resend', 'sendgrid', '<b>Resend and SendGrid both send email.</b> One is enough.');
      pair('algolia', 'meilisearch', '<b>Algolia and Meilisearch both power search.</b> Pick one.');
      pair('tailwind', 'bootstrap', '<b>Tailwind and Bootstrap are two styling systems</b> that can clash.');
      pair('datadog', 'prometheus', '<b>Datadog and Prometheus overlap</b> for metrics.');

      if (s.addons.includes('pinecone') && s.database && ['postgres', 'supabase', 'neon'].includes(s.database)) {
        out.push({
          severity: 'info' as const,
          ids: ['pinecone', s.database],
          message: `<b>${ctx.name(s.database)} can also store AI vectors</b> with pgvector, which may save a service.`,
        });
      }
      return out;
    },
  },
];

/** Look a rule up by id, for targeted tests. */
export const ruleById = (id: string): Rule | undefined => rules.find((r) => r.id === id);

export type { Stack };
