import { Table } from '@/components/Table';
import { fetchTable } from '@/lib/db/queries';

export default async function GamesPage() {
  const rows = await fetchTable('backtest_games', 1000);
  rows.sort((a, b) => Number(b.season) - Number(a.season) || Number(b.week) - Number(a.week));

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">Games</div>
          <h2>Model vs Vegas</h2>
        </div>
      </header>
      <Table
        rows={rows}
        columns={[
          { label: 'Season', className: 'num', render: row => String(row.season ?? '') },
          { label: 'Week', className: 'num', render: row => String(row.week ?? '') },
          { label: 'Home', render: row => String(row.home_team ?? '') },
          { label: 'Away', render: row => String(row.away_team ?? '') },
          { label: 'Vegas', render: row => String(row.vegas_spread ?? '') },
          { label: 'Model', render: row => String(row.model_spread ?? '') },
          { label: 'Diff', className: 'num', render: row => fmt(row.model_vegas_diff) },
          { label: 'Model Pick', render: row => String(row.model_vegas_pick ?? '') },
          { label: 'Result', render: row => <Pill value={String(row.model_vegas_result ?? '')} /> },
          { label: 'Actual', render: row => String(row.actual_result ?? '') },
          { label: 'Margin Error', className: 'num', render: row => fmt(row.margin_error) }
        ]}
      />
    </>
  );
}

function Pill({ value }: { value: string }) {
  const cls = value === 'WIN' ? 'win' : value === 'LOSS' ? 'loss' : '';
  return value ? <span className={`pill ${cls}`}>{value}</span> : null;
}

function fmt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, '') : '';
}
