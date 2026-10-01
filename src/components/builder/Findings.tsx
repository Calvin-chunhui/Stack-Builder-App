/**
 * Rendering for a single finding, plus the "Try:" fix chips beneath it.
 */
import type { Assessment, Finding, Stack } from '../../engine/types';
import { nm, suggestFixes } from '../../engine';
import { ICON, SEV_ICON } from '../../lib/icons';

/**
 * Finding messages carry inline <b> and <code> markup. They are composed
 * entirely by src/engine/rules.ts from the catalogue and never include user
 * input, so injecting them as HTML is safe.
 */
const Html = ({ html, className }: { html: string; className?: string }) => (
  <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
);

export const SevIcon = ({ severity }: { severity: Finding['severity'] }) => (
  <Html html={SEV_ICON[severity]} />
);

interface FixChipsProps {
  stack: Stack;
  item: Finding;
  assessment: Assessment;
  onSwap: (id: string) => void;
  onRemove: (id: string) => void;
}

export function FixChips({ stack, item, assessment, onSwap, onRemove }: FixChipsProps) {
  const fixes = suggestFixes(stack, item, assessment);
  if (!fixes.length) return null;

  return (
    <div className="fixes">
      <span>Try:</span>
      {fixes.map((f) =>
        f.type === 'remove' ? (
          <button key={`r-${f.id}`} className="fix" onClick={() => onRemove(f.id)}>
            Remove {nm(f.id)}
            {f.note ? ` (${f.note})` : ''}
          </button>
        ) : (
          <button key={`s-${f.id}`} className="fix" onClick={() => onSwap(f.id)}>
            <Html html={ICON.swap} />
            {nm(f.id)}
          </button>
        ),
      )}
    </div>
  );
}

interface NoteProps {
  item: Finding;
  stack?: Stack;
  assessment?: Assessment;
  onSwap?: (id: string) => void;
  onRemove?: (id: string) => void;
  /** Links to the tools a finding mentions. Used in the full report. */
  showTools?: boolean;
  flat?: boolean;
}

export function Note({
  item,
  stack,
  assessment,
  onSwap,
  onRemove,
  showTools = false,
  flat = false,
}: NoteProps) {
  const actionable = item.severity === 'block' || item.severity === 'warn';
  const canFix = Boolean(stack && assessment && onSwap && onRemove && actionable);

  return (
    <div className={flat ? 'note flat' : 'note'}>
      <SevIcon severity={item.severity} />
      <div>
        <Html html={item.message} />
        {canFix && (
          <FixChips
            stack={stack!}
            item={item}
            assessment={assessment!}
            onSwap={onSwap!}
            onRemove={onRemove!}
          />
        )}
        {showTools && item.ids.length > 0 && (
          <p className="note-tools">
            {item.ids.map((id) => (
              <a key={id} href={`/library/tool/${id}`}>
                {nm(id)}
              </a>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

export { Html };
