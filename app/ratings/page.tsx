import { Table } from '@/components/Table';
import { fetchTable } from '@/lib/db/queries';

export default async function RatingsPage() {
  const rows = await fetchTable('ratings', 500);
  rows.sort((a, b) => Number(b.season) - Number(a.season) || Number(b.composite || 0) - Number(a.composite || 0));

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">Ratings</div>
          <h2>Team Ratings</h2>
        </div>
      </header>
      <Table
        rows={rows}
        columns={[
          { label: 'Season', className: 'num', render: row => String(row.season ?? '') },
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
