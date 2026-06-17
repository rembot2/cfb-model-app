import { Table } from '@/components/Table';
import { fetchTable } from '@/lib/db/queries';

export default async function OptimizerPage() {
  const rows = await fetchTable('weight_optimizer', 200);
  rows.sort((a, b) => Number(a.rank) - Number(b.rank));

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">Optimizer</div>
          <h2>Weight Results</h2>
        </div>
      </header>
      <Table
        rows={rows}
        columns={[
          { label: 'Rank', className: 'num', render: row => String(row.rank ?? '') },
          { label: 'Use', render: row => String(row.use_this ?? '') },
          { label: 'Pass', className: 'num', render: row => fmt(row.pass_weight) },
          { label: 'Rush', className: 'num', render: row => fmt(row.rush_weight) },
          { label: 'Overall', className: 'num', render: row => fmt(row.overall_weight) },
          { label: 'Composite', className: 'num', render: row => fmt(row.composite_weight) },
          { label: 'P/R', className: 'num', render: row => fmt(row.points_per_rating) },
          { label: 'HFA', className: 'num', render: row => fmt(row.home_field) },
          { label: 'Shrink', className: 'num', render: row => fmt(row.margin_shrink) },
          { label: 'Max', className: 'num', render: row => fmt(row.max_margin) },
          { label: 'Final Score', className: 'num', render: row => fmt(row.final_score) }
        ]}
      />
    </>
  );
}

function fmt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, '') : '';
}
