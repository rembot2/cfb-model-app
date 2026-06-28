import { SeasonSelect } from '@/components/SeasonSelect';
import { fetchRatingTeam } from '@/lib/db/queries';
import Link from 'next/link';
import type { CSSProperties } from 'react';

export const dynamic = 'force-dynamic';

type TeamRatingPageProps = {
  params: { team: string };
  searchParams?: { season?: string };
};

const matchupRatings = [
  ['Pass Offense', 'pass_off_rating'],
  ['Rush Offense', 'rush_off_rating'],
  ['Pass Defense', 'pass_def_rating'],
  ['Rush Defense', 'rush_def_rating']
] as const;

const positionRatings = [
  ['QB', 'qb_rating'],
  ['RB', 'rb_rating'],
  ['WR', 'wr_rating'],
  ['TE', 'te_rating'],
  ['OL', 'ol_rating'],
  ['DL', 'dl_rating'],
  ['LB', 'lb_rating'],
  ['CB', 'cb_rating'],
  ['S', 's_rating'],
  ['K', 'k_rating'],
  ['P', 'p_rating']
] as const;

export default async function TeamRatingPage({ params, searchParams }: TeamRatingPageProps) {
  const requestedSeason = Number(searchParams?.season);
  const { row, rank, seasons, season, roster } = await fetchRatingTeam(
    Number.isFinite(requestedSeason) ? requestedSeason : undefined,
    params.team
  );
  const team = decodeURIComponent(params.team);

  if (!row) {
    return (
      <>
        <header className="topbar">
          <div>
            <div className="eyebrow">Ratings</div>
            <h2>{team}</h2>
            <p className="page-subtitle">No rating found for this season.</p>
          </div>
          <SeasonSelect seasons={seasons} selected={season} />
        </header>
        <Link className="back-link" href={`/ratings?season=${season ?? ''}`}>Back to ratings</Link>
      </>
    );
  }

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">Ratings</div>
          <h2>{team}</h2>
          <p className="page-subtitle">
            {season} season{rank ? ` | Rank #${rank}` : ''}
          </p>
        </div>
        <SeasonSelect seasons={seasons} selected={season} />
      </header>

      <Link className="back-link" href={`/ratings?season=${season ?? ''}`}>Back to ratings</Link>

      <section className="rating-rings">
        <RatingRing label="Composite" value={row.composite} delta={row.composite_delta} />
        <RatingRing label="Offense" value={row.off_rating} delta={row.off_rating_delta} />
        <RatingRing label="Defense" value={row.def_rating} delta={row.def_rating_delta} />
      </section>

      <section className="detail-section">
        <div className="panel-header">
          <h3>Pass / Rush Ratings</h3>
        </div>
        <div className="rating-card-grid">
          {matchupRatings.map(([label, key]) => (
            <RatingCard key={key} label={label} value={row[key]} />
          ))}
        </div>
      </section>

      <section className="detail-section">
        <div className="panel-header">
          <h3>Position Ratings</h3>
        </div>
        <div className="position-roster-grid">
          {positionRatings.map(([label, key]) => (
            <PositionRosterCard
              key={key}
              label={label}
              value={row[key]}
              players={roster.filter(player => normalizePosition(player.position) === label)}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function PositionRosterCard({
  label,
  value,
  players
}: {
  label: string;
  value: unknown;
  players: Array<Record<string, unknown>>;
}) {
  return (
    <div className="rating-detail-card position-roster-card">
      <div>
        <span>{label}</span>
        <strong>{fmt(value)}</strong>
      </div>
      <div className="mini-meter">
        <div style={{ width: `${Math.max(0, Math.min(100, numberValue(value)))}%` }} />
      </div>
      <div className="position-player-list">
        {players.length ? players.map((player, index) => (
          <div key={`${player.player_name}-${index}`} className="position-player-row">
            <span>{String(player.player_name ?? '')}</span>
            <strong>{fmt(player.rating)}</strong>
          </div>
        )) : (
          <div className="position-player-empty">No roster players loaded</div>
        )}
      </div>
    </div>
  );
}

function RatingRing({ label, value, delta }: { label: string; value: unknown; delta?: unknown }) {
  const n = numberValue(value);
  const pct = Math.max(0, Math.min(100, n));
  return (
    <div className="rating-ring-card">
      <div className="rating-ring" style={{ '--rating-pct': `${pct}%` } as CSSProperties}>
        <div className="rating-ring-inner">{fmt(n)}</div>
      </div>
      <div className="rating-ring-label">
        {label}
        <RatingDeltaArrow delta={delta} />
      </div>
    </div>
  );
}

function RatingDeltaArrow({ delta }: { delta: unknown }) {
  const n = Number(delta);
  const direction = Number.isFinite(n) && Math.abs(n) >= 0.01
    ? n > 0 ? 'up' : 'down'
    : '';
  return direction ? <span className={`rating-change ${direction}`} title={`${direction === 'up' ? '+' : ''}${fmt(n)}`} /> : null;
}

function RatingCard({ label, value }: { label: string; value: unknown }) {
  const n = numberValue(value);
  const pct = Math.max(0, Math.min(100, n));
  return (
    <div className="rating-detail-card">
      <div>
        <span>{label}</span>
        <strong>{fmt(n)}</strong>
      </div>
      <div className="mini-meter">
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, '') : '';
}

function normalizePosition(value: unknown) {
  const position = String(value || '').toUpperCase().trim();
  if (position === 'QB') return 'QB';
  if (['RB', 'HB', 'FB'].includes(position)) return 'RB';
  if (position === 'WR') return 'WR';
  if (position === 'TE') return 'TE';
  if (['OL', 'OT', 'IOL', 'OG', 'C'].includes(position)) return 'OL';
  if (['DL', 'EDGE', 'DE', 'DT', 'NT'].includes(position)) return 'DL';
  if (['LB', 'ILB', 'OLB'].includes(position)) return 'LB';
  if (position === 'CB') return 'CB';
  if (['S', 'SAF'].includes(position)) return 'S';
  if (['K', 'PK'].includes(position)) return 'K';
  if (position === 'P') return 'P';
  return position;
}
