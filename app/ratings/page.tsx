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
      <header className="page-hero">
        <div>
          <div className="eyebrow">Power Ratings</div>
          <h2>{season ?? ''} team rating board</h2>
          <p className="page-subtitle">
            Composite, offense, and defense are the headline ratings. Open a team profile for matchup splits, position groups, and roster detail.
          </p>
        </div>
        <div className="page-hero-actions">
          <SeasonSelect seasons={seasons} selected={season} />
        </div>
      </header>

      <section className="page-summary-grid">
        <SummaryTile label="Teams Loaded" value={String(rows.length)} detail={season ? `${season} season` : 'No season selected'} />
        <SummaryTile label="No. 1 Team" value={String(rows[0]?.team ?? '-')} detail={`Composite ${fmt(rows[0]?.composite) || '-'}`} />
        <SummaryTile label="Top Offense" value={leader(rows, 'off_rating')} detail="Best offensive rating" />
        <SummaryTile label="Top Defense" value={leader(rows, 'def_rating')} detail="Best defensive rating" />
      </section>

      <section className="panel table-panel">
        <div className="panel-header">
          <div>
            <h3>National Board</h3>
            <p className="page-subtitle">Click a team to open its full rating profile.</p>
          </div>
        </div>
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
      </section>
    </>
  );
}

function SummaryTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="summary-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
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

function leader(rows: Record<string, unknown>[], key: string) {
  const row = rows.slice().sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0))[0];
  return row ? String(row.team ?? '-') : '-';
}
