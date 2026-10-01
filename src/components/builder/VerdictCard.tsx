/**
 * "Will it work?" - the verdict, a score, a row per connection and the first
 * few things worth fixing.
 */
import type { Assessment, Stack } from '../../engine/types';
import { GROUPS, verdictText } from '../../engine';
import { ICON } from '../../lib/icons';
import { Html, Note, SevIcon } from './Findings';

interface Props {
  stack: Stack;
  assessment: Assessment;
  onSwap: (id: string) => void;
  onRemove: (id: string) => void;
  reportHref: string;
  /** How many findings to surface before linking to the full report. */
  maxIssues?: number;
}

export function VerdictCard({
  stack,
  assessment: a,
  onSwap,
  onRemove,
  reportHref,
  maxIssues = 3,
}: Props) {
  const [headline, sub] = verdictText(a);
  const issues = a.items.filter((i) => i.severity === 'block' || i.severity === 'warn').slice(0, maxIssues);

  return (
    <section className={`verdict v-${a.verdict}`} aria-live="polite">
      <div className="v-head">
        <div>
          <p className="v-kicker">Will it work?</p>
          <h3>{headline}</h3>
          <p className="v-sub">{sub}</p>
        </div>
        {a.verdict !== 'empty' && (
          <div className="v-score" style={{ ['--p' as string]: a.score } as React.CSSProperties}>
            <b>{a.score}</b>
            <small>/100</small>
          </div>
        )}
      </div>

      <ul className="groups">
        {GROUPS.map((g) => {
          const status = a.groupStatus[g.id];
          const toFix = a.items.filter(
            (i) => i.group === g.id && (i.severity === 'block' || i.severity === 'warn'),
          ).length;

          return (
            <li className={`g-row g-${status}`} key={g.id}>
              {status === 'none' ? (
                <span className="g-dot" aria-hidden="true" />
              ) : (
                <SevIcon severity={status} />
              )}
              <span>{g.name}</span>
              <em>
                {status === 'none'
                  ? 'Not set'
                  : toFix
                    ? `${toFix} to fix`
                    : status === 'info'
                      ? 'Notes'
                      : 'Good'}
              </em>
            </li>
          );
        })}
      </ul>

      {issues.map((item) => (
        <Note
          key={`${item.rule}-${item.ids.join('-')}`}
          item={item}
          stack={stack}
          assessment={a}
          onSwap={onSwap}
          onRemove={onRemove}
        />
      ))}

      <a className="btn-secondary v-more" href={reportHref}>
        See the full report
        <Html html={ICON.next} />
      </a>
    </section>
  );
}
