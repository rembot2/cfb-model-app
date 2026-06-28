import { Table } from '@/components/Table';
import { getPublicSupabase } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export default async function OptimizerPage() {
  const supabase = getPublicSupabase();
  const { data, error } = await supabase
    .from('weight_optimizer')
    .select('*')
    .order('rank', { ascending: true })
    .limit(250);
  if (error) throw new Error(error.message);
  const rows = data || [];

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">Optimizer</div>
          <h2>Weight Results</h2>
          <p className="page-subtitle">Rows are ranked after testing coach boosts, ramp weeks, spread weights, and calibration.</p>
        </div>
      </header>
      <section className="panel optimizer-summary">
        <h3>How To Read This</h3>
        <p>
          Lower final score is better. The optimizer tests spread weights, points per rating, home field, shrink, max margin,
          coach boost strength, and ramp weeks. The row labeled BEST is the formula that was saved as active.
        </p>
      </section>
      <Table
        rows={rows}
        columns={[
          { label: 'Rank', className: 'num', render: (_row, index) => String(index + 1) },
          { label: 'Use', render: row => String(row.use_this ?? '') },
          { label: 'Final Score', className: 'num', render: row => fmt(row.final_score) },
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
          { label: 'Dev', className: 'num', render: row => fmt(row.coach_development_boost) },
          { label: 'Ramp Wks', className: 'num', render: row => fmt(row.rating_talent_ramp_weeks) }
        ]}
      />
    </>
  );
}

function fmt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, '') : '';
}
