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
          { label: 'Composite', className: 'num', render: row => fmt(row.composite) },
          { label: 'Offense', className: 'num', render: row => fmt(row.off_rating) },
          { label: 'Defense', className: 'num', render: row => fmt(row.def_rating) }
        ]}
      />
    </>
  );
}

function fmt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, '') : '';
}
