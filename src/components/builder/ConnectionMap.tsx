/**
 * The connection map: each line is a connection between two parts, coloured by
 * the worst finding for that connection.
 */
import type { Assessment, GroupId, LayerId, Stack } from '../../engine/types';
import { COMPAT, nm } from '../../engine';
import { layerColor } from '../../data/taxonomy';

const EDGE_COLOR: Record<string, string> = {
  ok: '#7ACBA8',
  warn: '#F4C95D',
  block: '#FF7A7A',
  info: '#A2A5C3',
  none: '#353B60',
};

interface Props {
  stack: Stack;
  assessment: Assessment;
}

export function ConnectionMap({ stack: s, assessment: r }: Props) {
  const Node = ({
    x,
    y,
    w,
    layer,
    label,
    sub,
  }: {
    x: number;
    y: number;
    w: number;
    layer: LayerId | null;
    label: string;
    sub: string;
  }) => (
    <g
      className="map-node"
      transform={`translate(${x},${y})`}
      style={{ ['--c' as string]: layer ? layerColor(layer) : 'var(--muted)' } as React.CSSProperties}
    >
      <rect width={w} height={56} rx={10} className={label ? undefined : 'is-empty'} />
      <text x={w / 2} y={23} textAnchor="middle" className="mn-layer">
        {sub}
      </text>
      <text x={w / 2} y={42} textAnchor="middle" className="mn-name">
        {label || 'None'}
      </text>
    </g>
  );

  const Edge = ({
    x1,
    y1,
    x2,
    y2,
    group,
  }: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    group: GroupId;
  }) => {
    const status = r.groupStatus[group];
    return (
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={EDGE_COLOR[status]}
        strokeWidth={status === 'none' ? 2 : 4}
        strokeDasharray={status === 'none' ? '6 6' : undefined}
        strokeLinecap="round"
      />
    );
  };

  // A meta-framework's server routes, or a BaaS, stands in for a backend.
  const backendLabel = s.backend
    ? nm(s.backend)
    : s.frontend && COMPAT[s.frontend]?.srv
      ? `${nm(s.frontend)} server`
      : s.database && COMPAT[s.database]?.baas
        ? `${nm(s.database)} (BaaS)`
        : '';

  return (
    <>
      <svg
        className="map"
        viewBox="0 0 760 420"
        role="img"
        aria-label="Connection map: each line shows whether two parts of the stack work together."
      >
        {s.mobile ? (
          <>
            <Edge x1={230} y1={86} x2={380} y2={160} group="ui" />
            <Edge x1={530} y1={86} x2={380} y2={160} group="ui" />
          </>
        ) : (
          <Edge x1={380} y1={86} x2={380} y2={160} group="ui" />
        )}
        <Edge x1={170} y1={188} x2={300} y2={188} group="auth" />
        <Edge x1={380} y1={216} x2={380} y2={270} group="data" />
        <Edge x1={460} y1={188} x2={590} y2={188} group="addons" />
        <Edge x1={380} y1={326} x2={380} y2={352} group="hosting" />
        <Edge x1={640} y1={326} x2={640} y2={352} group="ops" />

        <Node
          x={s.mobile ? 130 : 280}
          y={30}
          w={200}
          layer="frontend"
          label={s.frontend ? nm(s.frontend) : ''}
          sub="Frontend"
        />
        {s.mobile && <Node x={430} y={30} w={200} layer="mobile" label={nm(s.mobile)} sub="Mobile" />}
        <Node x={20} y={160} w={150} layer="auth" label={s.auth ? nm(s.auth) : ''} sub="Auth" />
        <Node x={300} y={160} w={160} layer="backend" label={backendLabel} sub="Backend" />
        <Node
          x={590}
          y={160}
          w={150}
          layer="addons"
          label={
            s.addons.length ? `${s.addons.length} add-on${s.addons.length > 1 ? 's' : ''}` : ''
          }
          sub="Add-ons"
        />
        <Node
          x={300}
          y={270}
          w={160}
          layer="database"
          label={s.database ? nm(s.database) : ''}
          sub="Database"
        />
        <Node
          x={560}
          y={270}
          w={160}
          layer="devops"
          label={s.devops.length ? s.devops.map(nm).join(', ').slice(0, 22) : ''}
          sub="DevOps"
        />

        <g
          className="map-node"
          transform="translate(20,352)"
          style={{ ['--c' as string]: 'var(--host)' } as React.CSSProperties}
        >
          <rect width={720} height={52} rx={10} className={s.hosting ? undefined : 'is-empty'} />
          <text x={360} y={22} textAnchor="middle" className="mn-layer">
            Hosting
          </text>
          <text x={360} y={40} textAnchor="middle" className="mn-name">
            {s.hosting ? nm(s.hosting) : 'None'}
          </text>
        </g>
      </svg>

      <ul className="map-key">
        <li>
          <i style={{ background: EDGE_COLOR.ok }} />
          Works
        </li>
        <li>
          <i style={{ background: EDGE_COLOR.warn }} />
          Needs care
        </li>
        <li>
          <i style={{ background: EDGE_COLOR.block }} />
          Won't work
        </li>
        <li>
          <i style={{ background: EDGE_COLOR.info }} />
          Notes only
        </li>
        <li>
          <i className="dash" />
          Not set yet
        </li>
      </ul>
    </>
  );
}
