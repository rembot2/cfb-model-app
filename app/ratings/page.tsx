import { Table } from '@/components/Table';
import { SeasonSelect } from '@/components/SeasonSelect';
import { fetchRatingsSeason } from '@/lib/db/queries';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function RatingsPage({ searchParams }: { searchParams?: { season?: string } }) {
  const requestedSeason = Number(searchParams?.season);
  const { rows, seasons, season } = await fetchRatingsSeason(
    Number.isFinite(requestedSeason) ? requestedSeason : undefined
  );

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">Ratings</div>
          <h2>Team Ratings</h2>
          <div className="page-subtitle">{rows.length} teams</div>
        </div>
        <SeasonSelect seasons={seasons} selected={season} />
      </header>
      <Table
        rows={rows}
        columns={[
          { label: 'Rank', className: 'num', render: (_row, index) => String(index + 1) },
          {
            label: 'Team',
            render: row => {
              const team = String(row.team ?? '');
              return (
                <Link className="team-link" href={`/ratings/${encodeURIComponent(team)}?season=${season ?? ''}`}>
                  {team}
                </Link>
              );
            }
          },
          { label: 'Composite', className: 'num', render: row => <RatingWithDelta value={row.composite} delta={row.composite_delta} /> },
          { label: 'Offense', className: 'num', render: row => <RatingWithDelta value={row.off_rating} delta={row.off_rating_delta} /> },
          { label: 'Defense', className: 'num', render: row => <RatingWithDelta value={row.def_rating} delta={row.def_rating_delta} /> }
        ]}
      />
    </>
  );
}

function RatingWithDelta({ value, delta }: { value: unknown; delta: unknown }) {
  const n = Number(delta);
  const direction = Number.isFinite(n) && Math.abs(n) >= 0.01
    ? n > 0 ? 'up' : 'down'
    : '';
  return (
    <span className="rating-delta-cell">
      <span>{fmt(value)}</span>
      {direction ? <span className={`rating-change ${direction}`} title={`${direction === 'up' ? '+' : ''}${fmt(n)}`} /> : null}
    </span>
  );
}

function fmt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, '') : '';
}
