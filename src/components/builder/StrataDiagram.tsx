/**
 * The stack drawn as stacked slabs: what users see on top, where it runs at
 * the bottom, DevOps as a band down the side and add-ons plugged in below.
 */
import type { LayerId, Stack } from '../../engine/types';
import { nm } from '../../engine';
import { layerColor, layerName } from '../../data/taxonomy';

/** Top to bottom, which is deliberately not the data model's order. */
const SLAB_LAYERS: LayerId[] = ['frontend', 'backend', 'auth', 'database', 'hosting'];

const EMPTY_LABEL: Record<string, string> = {
  frontend: 'Pick a frontend',
  backend: 'Pick a backend',
  auth: 'Pick an auth provider',
  database: 'Pick a database',
  hosting: 'Pick a hosting platform',
};

interface Props {
  stack: Stack;
  lastSet: LayerId | null;
  intro: boolean;
}

export function StrataDiagram({ stack, lastSet, intro }: Props) {
  const slab = (layer: LayerId) => {
    const id = stack[layer] as string | null;
    const just = lastSet === layer ? ' just-set' : '';
    const style = { ['--c' as string]: layerColor(layer) } as React.CSSProperties;

    if (!id) {
      return (
        <div className="slab is-empty" style={style} key={layer}>
          <span className="slab-layer">{layerName(layer)}</span>
          <span className="slab-tool">{EMPTY_LABEL[layer]}</span>
        </div>
      );
    }
    return (
      <a
        className={`slab${just}`}
        style={style}
        href={`/library/tool/${id}`}
        key={layer}
        aria-label={`${layerName(layer)}: ${nm(id)}. Learn more`}
      >
        <span className="slab-layer">{layerName(layer)}</span>
        <span className="slab-tool">{nm(id)}</span>
      </a>
    );
  };

  // With a mobile app chosen, the top slab splits into frontend + mobile.
  const top = stack.mobile ? (
    <div className="slab-row" key="top">
      {slab('frontend')}
      <a
        className={`slab${lastSet === 'mobile' ? ' just-set' : ''}`}
        style={{ ['--c' as string]: 'var(--mob)' } as React.CSSProperties}
        href={`/library/tool/${stack.mobile}`}
        aria-label={`Mobile: ${nm(stack.mobile)}. Learn more`}
      >
        <span className="slab-layer">Mobile</span>
        <span className="slab-tool">{nm(stack.mobile)}</span>
      </a>
    </div>
  ) : (
    slab('frontend')
  );

  const ops = stack.devops;

  return (
    <>
      <div className={`strata${intro ? ' is-intro' : ''}`}>
        <div className="slabs">
          {top}
          {SLAB_LAYERS.slice(1).map(slab)}
        </div>

        {ops.length ? (
          <a
            className="ops-band"
            href={`/library/tool/${ops[0]}`}
            aria-label={`DevOps: ${ops.map(nm).join(', ')}`}
          >
            <span>
              <small>DevOps</small>
              {ops.map(nm).join(' + ')}
            </span>
          </a>
        ) : (
          <div className="ops-band is-empty">
            <span>
              <small>DevOps</small>none yet
            </span>
          </div>
        )}
      </div>

      {stack.addons.length > 0 && (
        <div className="addon-strip" style={{ ['--c' as string]: 'var(--add)' } as React.CSSProperties}>
          <span>Plugged in</span>
          {stack.addons.map((a) => (
            <a className="addon-chip" key={a} href={`/library/tool/${a}`}>
              {nm(a)}
            </a>
          ))}
        </div>
      )}

      <div className="strata-caption">
        <span>What users see</span>
        <span>Where it runs</span>
      </div>
    </>
  );
}
