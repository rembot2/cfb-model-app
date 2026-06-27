import { FormulaControls } from '@/components/FormulaControls';
import { Table } from '@/components/Table';
import { fetchFormulaData } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function FormulaPage() {
  const { activeConfig, recentConfigs, optimizer } = await fetchFormulaData();

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">Formula</div>
          <h2>Model Controls</h2>
          <p className="page-subtitle">Adjust the same values that used to feel like spreadsheet cells.</p>
        </div>
      </header>

      <FormulaControls activeConfig={activeConfig} />

      <div className="grid formula-tables">
        <section>
          <div className="panel-header">
            <h3>Recent Formulas</h3>
          </div>
          <Table
            rows={recentConfigs}
            columns={[
              { label: 'Active', render: row => row.is_active ? 'Yes' : '' },
              { label: 'Name', render: row => String(row.name ?? '') },
              { label: 'Pass', className: 'num', render: row => fmt(row.pass_weight) },
              { label: 'Rush', className: 'num', render: row => fmt(row.rush_weight) },
              { label: 'Overall', className: 'num', render: row => fmt(row.overall_weight) },
              { label: 'Composite', className: 'num', render: row => fmt(row.composite_weight) },
              { label: 'P/R', className: 'num', render: row => fmt(row.points_per_rating) },
              { label: 'HFA', className: 'num', render: row => fmt(row.home_field) },
              { label: 'Shrink', className: 'num', render: row => fmt(row.margin_shrink) },
              { label: 'Max', className: 'num', render: row => fmt(row.max_margin) },
              { label: 'Coach O', className: 'num', render: row => fmt(row.coach_offense_boost) },
              { label: 'Coach D', className: 'num', render: row => fmt(row.coach_defense_boost) },
              { label: 'Dev', className: 'num', render: row => fmt(row.coach_development_boost) }
            ]}
          />
        </section>

        <section>
          <div className="panel-header">
            <h3>Best Optimizer Rows</h3>
          </div>
          <Table
            rows={optimizer}
            columns={[
              { label: 'Rank', className: 'num', render: row => String(row.rank ?? '') },
              { label: 'Use', render: row => String(row.use_this ?? '') },
              { label: 'Pass', className: 'num', render: row => fmt(row.pass_weight) },
              { label: 'Rush', className: 'num', render: row => fmt(row.rush_weight) },
              { label: 'Overall', className: 'num', render: row => fmt(row.overall_weight) },
              { label: 'Composite', className: 'num', render: row => fmt(row.composite_weight) },
              { label: 'Score', className: 'num', render: row => fmt(row.final_score) }
            ]}
          />
        </section>
      </div>
    </>
  );
}

function fmt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, '') : '';
}
