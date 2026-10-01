/**
 * The sticky panel: name, strata diagram, verdict and the actions that turn a
 * stack into something you can keep or send to someone.
 */
import type { Assessment, LayerId, Stack, Summary } from '../../engine/types';
import { coreCount } from '../../engine';
import { ICON } from '../../lib/icons';
import { Html } from './Findings';
import { StrataDiagram } from './StrataDiagram';
import { VerdictCard } from './VerdictCard';

interface Props {
  stack: Stack;
  name: string;
  assessment: Assessment;
  summary: Summary;
  lastSet: LayerId | null;
  intro: boolean;
  isSaved: boolean;
  reportHref: string;
  onRename: (name: string) => void;
  onSwap: (id: string) => void;
  onRemove: (id: string) => void;
  onSave: () => void;
  onCopyLink: () => void;
  onCopyMarkdown: () => void;
}

export function StackPanel({
  stack,
  name,
  assessment,
  summary: sm,
  lastSet,
  intro,
  isSaved,
  reportHref,
  onRename,
  onSwap,
  onRemove,
  onSave,
  onCopyLink,
  onCopyMarkdown,
}: Props) {
  const core = coreCount(stack);

  const startCost = !sm.parts
    ? '—'
    : sm.paidNow.length
      ? `From about $${sm.startCost}/mo`
      : 'Free tiers cover it';

  return (
    <aside className="panel" aria-label="Your stack">
      <div className="panel-top">
        <div style={{ flex: 1, minWidth: 0 }}>
          <label className="sr-only" htmlFor="stackName">
            Stack name
          </label>
          <input
            className="stack-name"
            id="stackName"
            value={name}
            maxLength={60}
            onChange={(e) => onRename(e.target.value)}
          />
          <p className="stack-meta">
            {core} of 6 core layers
            {stack.mobile ? ' + mobile' : ''}
            {stack.addons.length
              ? ` + ${stack.addons.length} add-on${stack.addons.length > 1 ? 's' : ''}`
              : ''}
          </p>
        </div>
        <button
          className="icon-btn"
          aria-label="Rename stack"
          title="Rename"
          onClick={() => {
            const el = document.getElementById('stackName') as HTMLInputElement | null;
            el?.focus();
            el?.select();
          }}
        >
          <Html html={ICON.pencil} />
        </button>
      </div>

      <StrataDiagram stack={stack} lastSet={lastSet} intro={intro} />

      <VerdictCard
        stack={stack}
        assessment={assessment}
        onSwap={onSwap}
        onRemove={onRemove}
        reportHref={reportHref}
      />

      <dl className="mini-stats">
        <div>
          <dt>You'll write</dt>
          <dd>{sm.langs.length ? sm.langs.join(', ') : '—'}</dd>
        </div>
        <div>
          <dt>Difficulty</dt>
          <dd>{sm.complexity}</dd>
        </div>
        <div>
          <dt>To start</dt>
          <dd>{startCost}</dd>
        </div>
      </dl>

      <div className="panel-actions">
        <button className="btn-primary" onClick={onSave}>
          {isSaved ? 'Update saved stack' : 'Save stack'}
        </button>
        <button className="btn-secondary" onClick={onCopyLink}>
          <Html html={ICON.link} />
          Copy link
        </button>
      </div>
      <div className="panel-actions" style={{ gridTemplateColumns: '1fr', marginTop: 10 }}>
        <button className="btn-secondary" onClick={onCopyMarkdown}>
          Copy as Markdown
        </button>
      </div>
    </aside>
  );
}
