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
  const { row, rank, seasons, season } = await fetchRatingTeam(
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
        <RatingRing label="Composite" value={row.composite} />
        <RatingRing label="Offense" value={row.off_rating} />
        <RatingRing label="Defense" value={row.def_rating} />
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
        <div className="rating-card-grid positions">
          {positionRatings.map(([label, key]) => (
            <RatingCard key={key} label={label} value={row[key]} />
          ))}
        </div>
      </section>
    </>
  );
}

function RatingRing({ label, value }: { label: string; value: unknown }) {
  const n = numberValue(value);
  const pct = Math.max(0, Math.min(100, n));
  return (
    <div className="rating-ring-card">
      <div className="rating-ring" style={{ '--rating-pct': `${pct}%` } as CSSProperties}>
        <div className="rating-ring-inner">{fmt(n)}</div>
      </div>
      <div className="rating-ring-label">{label}</div>
    </div>
  );
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
