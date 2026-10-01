/**
 * The shared-stack report at /stack?s=...
 *
 * Read-only by default: someone arriving from a link sees the full report and
 * can open it in the builder to change it. The stack is decoded on the client
 * because the page itself is static HTML served from a CDN.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  GROUPS,
  assess,
  cleanName,
  decodeStack,
  isEmptyStack,
  nm,
  summarize,
  toMarkdown,
  verdictText,
} from '../../engine';
import type { Stack } from '../../engine/types';
import { ICON, verdictIcon } from '../../lib/icons';
import { ConnectionMap } from './ConnectionMap';
import { Html, Note, SevIcon } from './Findings';

const toast = (msg: string) => window.sbToast?.(msg);
const copy = (text: string) => window.sbCopy?.(text) ?? Promise.resolve(false);

export default function SharedStack() {
  const [state, setState] = useState<{ stack: Stack; name: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setState({
      stack: decodeStack(params.get('s')),
      name: cleanName(params.get('n')) || 'Shared stack',
    });
  }, []);

  if (!state) {
    return <p className="sec-lede">Reading the stack from the link&hellip;</p>;
  }

  const { stack, name } = state;

  if (isEmptyStack(stack)) {
    return (
      <div className="lib-intro">
        <h1>Nothing in this link</h1>
        <p>
          This link doesn't contain a stack we recognise. It may be truncated, or it may name tools
          that no longer exist.
        </p>
        <a className="btn-primary" href="/builder" style={{ marginTop: 16 }}>
          Build one instead
          <Html html={ICON.next} />
        </a>
      </div>
    );
  }

  return <Report stack={stack} name={name} />;
}

function Report({ stack, name }: { stack: Stack; name: string }) {
  const a = useMemo(() => assess(stack), [stack]);
  const sm = useMemo(() => summarize(stack), [stack]);
  const [headline, sub] = verdictText(a);

  const openInBuilder = `/builder?s=${encodeURIComponent(
    new URLSearchParams(window.location.search).get('s') ?? '',
  )}&n=${encodeURIComponent(name)}`;

  const canStartFree = !sm.parts
    ? '—'
    : sm.paidNow.length
      ? `No: ${sm.paidNow.map(nm).join(', ')} ${sm.paidNow.length > 1 ? 'have' : 'has'} no free tier (about $${sm.startCost}/mo)`
      : 'Yes, free tiers cover every part';

  return (
    <>
      <div className="shared-banner">
        <p>
          Someone shared this stack with you. Nothing is stored on a server &mdash; the whole stack
          is in the link.
        </p>
        <a className="btn-primary" href={openInBuilder}>
          Open in the builder
          <Html html={ICON.next} />
        </a>
      </div>

      <div className="crumbs">
        <a className="back" href="/builder">
          <Html html={ICON.back} />
          Back to builder
        </a>
        <button
          className="btn-secondary"
          onClick={async () => {
            toast((await copy(toMarkdown(stack, name))) ? 'Copied as Markdown' : 'Copy failed');
          }}
        >
          Copy report as Markdown
        </button>
      </div>

      <header className={`report-head v-${a.verdict}`}>
        <div>
          <p className="v-kicker">Feasibility report for</p>
          <h1>{name}</h1>
          <p className="report-verdict">
            <Html html={verdictIcon(a.verdict)} />
            <span>
              <b>{headline}.</b> {sub}
            </span>
          </p>
        </div>
        {a.verdict !== 'empty' && (
          <div className="v-score big" style={{ ['--p' as string]: a.score } as React.CSSProperties}>
            <b>{a.score}</b>
            <small>/100</small>
          </div>
        )}
      </header>

      <p className="report-how">
        This report checks every connection in your stack using facts about each tool: which
        languages it uses, where it can run, which databases it supports and whether it needs a
        server. <b>Won't work</b> means something must change. <b>Needs care</b> means it can run
        with extra work. <b>Notes</b> are worth knowing but aren't problems.
      </p>

      <dl className="report-stats">
        <div>
          <dt>Can you start free?</dt>
          <dd>{canStartFree}</dd>
        </div>
        <div>
          <dt>Once you outgrow free tiers</dt>
          <dd>
            {!sm.parts
              ? '—'
              : `Roughly $${sm.later}/mo in entry plans${sm.usage ? ', plus usage-based charges' : ''}`}
          </dd>
        </div>
        <div>
          <dt>Difficulty</dt>
          <dd>
            {sm.complexity}
            {sm.parts ? ` (${sm.parts} parts)` : ''}
          </dd>
        </div>
        <div>
          <dt>You'll write</dt>
          <dd>{sm.langs.length ? sm.langs.join(', ') : '—'}</dd>
        </div>
      </dl>

      {sm.fees.length > 0 && (
        <p className="report-fees">
          <b>Per-use fees:</b> {sm.fees.join(' · ')}
        </p>
      )}

      <section className="report-sec">
        <h2>Connection map</h2>
        <p className="sec-lede">
          Each line is a connection between two parts. Its colour shows the worst finding for that
          connection.
        </p>
        <ConnectionMap stack={stack} assessment={a} />
      </section>

      <section className="report-sec">
        <h2>Every check, by connection</h2>
        {GROUPS.map((g) => {
          const items = a.items.filter((i) => i.group === g.id);
          const status = a.groupStatus[g.id];
          return (
            <div className={`rg rg-${status}`} key={g.id}>
              <h3>
                {status === 'none' ? <span className="g-dot" /> : <SevIcon severity={status} />}
                {g.name} <small>{g.q}</small>
              </h3>
              {items.length ? (
                items.map((item, i) => <Note key={`${item.rule}-${i}`} item={item} showTools />)
              ) : (
                <p className="rg-empty">Nothing to check yet. Pick tools in the related layers.</p>
              )}
            </div>
          );
        })}
      </section>

      <p className="report-disclaimer">
        This is a guide based on documented capabilities as of September 2026, not a guarantee.
        Always try a small prototype before committing.
      </p>
    </>
  );
}
