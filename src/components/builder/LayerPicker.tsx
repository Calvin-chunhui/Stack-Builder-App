/**
 * The tool picker: one section per layer, a jump bar, and a search box that
 * filters across names, languages and jobs.
 */
import { useMemo } from 'react';
import type { CatalogTool, LayerId, Stack } from '../../engine/types';
import { TOOLS, isMultiLayer, matches, nm, stackHas } from '../../engine';
import { ADDON_CATS, LAYERS, layerColor } from '../../data/taxonomy';
import { ICON } from '../../lib/icons';
import { Html } from './Findings';

interface Props {
  stack: Stack;
  query: string;
  /** Where each layer sits in the restaurant analogy. */
  places: Record<string, string>;
  onToggle: (id: string) => void;
}

function Tile({ tool, on, onToggle }: { tool: CatalogTool; on: boolean; onToggle: () => void }) {
  return (
    <div
      className={`tile${on ? ' is-on' : ''}`}
      style={{ ['--c' as string]: layerColor(tool.layer) } as React.CSSProperties}
    >
      <button className="tile-main" onClick={onToggle} aria-pressed={on}>
        <span className="tile-name">{tool.name}</span>
        <span className="tile-use">{tool.tagline}</span>
      </button>
      <a
        className="tile-info"
        href={`/library/tool/${tool.id}`}
        aria-label={`Learn more about ${tool.name}`}
        title="Learn more"
      >
        <Html html={ICON.info} />
      </a>
    </div>
  );
}

export function LayerPicker({ stack, query, places, onToggle }: Props) {
  const filtered = useMemo(() => TOOLS.filter((t) => matches(t, query)), [query]);

  return (
    <div className="picker">
      <nav className="jumpbar" aria-label="Jump to layer">
        {LAYERS.map((L) => {
          const v = stack[L.id];
          const n = Array.isArray(v) ? v.length : v ? 1 : 0;
          return (
            <a
              key={L.id}
              href={`#layer-${L.id}`}
              className={`jump${n ? ' has' : ''}`}
              style={{ ['--c' as string]: layerColor(L.id) } as React.CSSProperties}
            >
              {L.name}
              {n > 0 && <span>{n}</span>}
            </a>
          );
        })}
      </nav>

      {LAYERS.map((L) => {
        const tools = filtered.filter((t) => t.layer === L.id);
        const v = stack[L.id];
        const selected = Array.isArray(v) ? v : v ? [v] : [];

        const status = selected.length
          ? <b>{selected.map(nm).join(', ')}</b>
          : L.optional
            ? 'Optional'
            : isMultiLayer(L.id as LayerId)
              ? 'Pick any that apply'
              : 'Nothing chosen yet';

        let body: React.ReactNode;
        if (!tools.length) {
          body = <p className="no-match">No {L.name.toLowerCase()} tools match "{query}".</p>;
        } else if (L.id === 'addons') {
          // Add-ons are grouped by job, otherwise it is an undifferentiated wall.
          body = ADDON_CATS.map((c) => {
            const items = tools.filter((t) => t.category === c.id);
            if (!items.length) return null;
            return (
              <div key={c.id}>
                <h3 className="subhead">{c.name}</h3>
                <div className="tiles">
                  {items.map((t) => (
                    <Tile key={t.id} tool={t} on={stackHas(stack, t.id)} onToggle={() => onToggle(t.id)} />
                  ))}
                </div>
              </div>
            );
          });
        } else {
          body = (
            <div className="tiles">
              {tools.map((t) => (
                <Tile key={t.id} tool={t} on={stackHas(stack, t.id)} onToggle={() => onToggle(t.id)} />
              ))}
            </div>
          );
        }

        return (
          <section
            className="layer"
            id={`layer-${L.id}`}
            key={L.id}
            style={{ ['--c' as string]: layerColor(L.id) } as React.CSSProperties}
          >
            <div className="layer-head">
              <span className="layer-swatch" aria-hidden="true" />
              <h2>{L.name}</h2>
              <span className="layer-status">{status}</span>
              <a className="whats" href={`/library/${L.id}`}>
                What's this?
              </a>
            </div>
            <p className="layer-place">
              {places[L.id]}: {L.blurb.toLowerCase()}.
            </p>
            {body}
          </section>
        );
      })}
    </div>
  );
}
