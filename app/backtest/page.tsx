import { Table } from '@/components/Table';
import { fetchTable } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function BacktestPage() {
  const rows = await fetchTable('backtest_summary', 500);
  rows.sort((a, b) => String(b.season).localeCompare(String(a.season)) || String(a.week).localeCompare(String(b.week)));

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">Backtest</div>
          <h2>Summary</h2>
        </div>
      </header>
      <Table
        rows={rows}
        columns={[
          { label: 'Season', render: row => String(row.season ?? '') },
          { label: 'Week', render: row => String(row.week ?? '') },
          { label: 'Games', className: 'num', render: row => String(row.games ?? '') },
          { label: 'Pick %', className: 'num', render: row => pct(row.pick_pct) },
          { label: 'Avg Error', className: 'num', render: row => fmt(row.avg_margin_error) },
          { label: 'Median Error', className: 'num', render: row => fmt(row.median_margin_error) },
          { label: 'Vegas Edge Plays', className: 'num', render: row => String(row.vegas_edge_plays ?? '') },
          { label: 'Vegas Edge Win %', className: 'num', render: row => pct(row.vegas_edge_win_pct) }
        ]}
      />
    </>
  );
}

function fmt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, '') : '';
}

function pct(value: unknown) {
  const f = fmt(value);
  return f ? `${f}%` : '';
}
