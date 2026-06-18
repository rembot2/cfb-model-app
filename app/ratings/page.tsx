import { Table } from '@/components/Table';
import { SeasonSelect } from '@/components/SeasonSelect';
import { fetchRatingsSeason } from '@/lib/db/queries';

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
          { label: 'Team', render: row => String(row.team ?? '') },
          { label: 'Composite', className: 'num', render: row => fmt(row.composite) },
          { label: 'Off', className: 'num', render: row => fmt(row.off_rating) },
          { label: 'Def', className: 'num', render: row => fmt(row.def_rating) },
          { label: 'Rush Off', className: 'num', render: row => fmt(row.rush_off_rating) },
          { label: 'Pass Off', className: 'num', render: row => fmt(row.pass_off_rating) },
          { label: 'Rush Def', className: 'num', render: row => fmt(row.rush_def_rating) },
          { label: 'Pass Def', className: 'num', render: row => fmt(row.pass_def_rating) }
        ]}
      />
    </>
  );
}

function fmt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, '') : '';
}
