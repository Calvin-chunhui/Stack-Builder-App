/**
 * The builder island. The one interactive page on the site, so the only place
 * that hydrates a framework.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { assess, encodeStack, nm, pickedIds, summarize, toMarkdown } from '../../engine';
import { ICON } from '../../lib/icons';
import { Html } from './Findings';
import { LayerPicker } from './LayerPicker';
import { StackPanel } from './StackPanel';
import { consumeIntro, useBuilder, type SavedStack } from './store';

export interface RecipeSummary {
  id: string;
  name: string;
  parts: string;
  stack: Record<string, unknown>;
}

interface Props {
  recipes: RecipeSummary[];
  /** Where each layer sits in the restaurant analogy, from the layer hubs. */
  places: Record<string, string>;
}

/** Host-provided helpers from Base.astro; absent if that script failed. */
declare global {
  interface Window {
    sbToast?: (msg: string) => void;
    sbCopy?: (text: string) => Promise<boolean>;
  }
}

const toast = (msg: string) => window.sbToast?.(msg);
const copy = (text: string) => window.sbCopy?.(text) ?? Promise.resolve(false);

export default function Builder({ recipes, places }: Props) {
  const stack = useBuilder((s) => s.stack);
  const name = useBuilder((s) => s.name);
  const currentId = useBuilder((s) => s.currentId);
  const saved = useBuilder((s) => s.saved);
  const lastSet = useBuilder((s) => s.lastSet);
  const hydrated = useBuilder((s) => s.hydrated);

  const { hydrate, toggle, swapIn, remove, rename, load, reset, save, destroy } = useBuilder.getState();

  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Read the URL and localStorage once, on the client only.
  useEffect(() => hydrate(), [hydrate]);

  // The settle animation should play on a freshly loaded stack, not on
  // every keystroke, so it is consumed once per load.
  const intro = useMemo(() => (hydrated ? consumeIntro() : false), [hydrated, stack]);

  const assessment = useMemo(() => assess(stack), [stack]);
  const summary = useMemo(() => summarize(stack), [stack]);
  const encoded = useMemo(() => encodeStack(stack), [stack]);

  const reportHref = `/stack?s=${encodeURIComponent(encoded)}${
    name ? `&n=${encodeURIComponent(name)}` : ''
  }`;

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const handleCopyLink = async () => {
    const url = new URL(reportHref, window.location.origin).toString();
    toast((await copy(url)) ? 'Link copied' : 'Copy failed');
  };

  const handleLoadSaved = (sv: SavedStack) => {
    load(sv.stack, sv.name, sv.id);
    setMenuOpen(false);
    toast(`Loaded ${sv.name}`);
  };

  return (
    <>
      <nav className="presets" aria-label="Presets">
        <span className="presets-label">Start from a preset</span>
        {recipes.map((r) => (
          <button
            key={r.id}
            className="preset"
            onClick={() => {
              load(r.stack as never, r.name);
              toast(`Loaded the ${r.name} preset`);
            }}
          >
            <strong>{r.name}</strong>
            <small>{r.parts}</small>
          </button>
        ))}
      </nav>

      <div className="presets" aria-label="Stack actions">
        <div className="topbar-actions" style={{ marginLeft: 0 }} ref={menuRef}>
          <button
            className="btn-ghost"
            aria-expanded={menuOpen}
            aria-controls="savedMenu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="hide-sm">Saved stacks</span>
            <span className="show-sm">Saved</span>
            <span className="count">{saved.length}</span>
          </button>
          <button
            className="btn-ghost"
            onClick={() => {
              reset();
              toast('Started a new stack');
            }}
          >
            New stack
          </button>

          <div className="saved-menu" id="savedMenu" hidden={!menuOpen}>
            {saved.length ? (
              saved.map((sv) => (
                <div className="saved-row" key={sv.id}>
                  <button className="saved-load" onClick={() => handleLoadSaved(sv)}>
                    <strong>{sv.name}</strong>
                    <small>{describeStack(sv)}</small>
                  </button>
                  <button
                    className="saved-del"
                    aria-label={`Delete ${sv.name}`}
                    onClick={() => destroy(sv.id)}
                  >
                    <Html html={ICON.trash} />
                  </button>
                </div>
              ))
            ) : (
              <p className="saved-empty">No saved stacks yet. Build one and press Save stack.</p>
            )}
          </div>
        </div>

        <label className="search" style={{ maxWidth: 340 }}>
          <Html html={ICON.search} />
          <span className="sr-only">Filter tools</span>
          <input
            type="search"
            placeholder="Filter tools, languages or jobs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </label>
      </div>

      <div className="workspace">
        <LayerPicker stack={stack} query={query} places={places} onToggle={toggle} />
        <StackPanel
          stack={stack}
          name={name}
          assessment={assessment}
          summary={summary}
          lastSet={lastSet}
          intro={intro}
          isSaved={Boolean(currentId)}
          reportHref={reportHref}
          onRename={rename}
          onSwap={(id) => {
            swapIn(id);
            toast(`Switched to ${nameOf(id)}`);
          }}
          onRemove={(id) => {
            remove(id);
            toast(`Removed ${nameOf(id)}`);
          }}
          onSave={() => {
            save();
            toast(currentId ? 'Saved stack updated' : 'Stack saved');
          }}
          onCopyLink={handleCopyLink}
          onCopyMarkdown={async () => {
            toast((await copy(toMarkdown(stack, name))) ? 'Copied as Markdown' : 'Copy failed');
          }}
        />
      </div>
    </>
  );
}

const nameOf = (id: string) => nm(id);

/** One-line contents of a saved stack, for the Saved stacks menu. */
const describeStack = (sv: SavedStack) => pickedIds(sv.stack).map(nm).join(', ') || 'Empty';
