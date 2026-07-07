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
  const best = rows[0] ?? {};

  return (
    <>
      <header className="page-hero">
        <div>
          <div className="eyebrow">Optimizer</div>
          <h2>Formula leaderboard.</h2>
          <p className="page-subtitle">
            Ranked optimizer results across spread weights, calibration, coach boosts, and talent ramp timing.
          </p>
        </div>
      </header>

      <section className="page-summary-grid">
        <SummaryTile label="Best Score" value={fmt(best.final_score) || '-'} detail="Lower is better" />
        <SummaryTile label="Best Weights" value={`${fmt(best.pass_weight)}/${fmt(best.rush_weight)}`} detail="Pass / rush" />
        <SummaryTile label="Coach Boosts" value={`${fmt(best.coach_offense_boost)}/${fmt(best.coach_defense_boost)}`} detail="Offense / defense" />
        <SummaryTile label="Ramp Weeks" value={fmt(best.rating_talent_ramp_weeks) || '-'} detail="Best timing found" />
      </section>

      <section className="split-grid">
        <div className="panel optimizer-summary">
          <h3>How To Read This</h3>
          <p>
            Lower final score is better. The optimizer tests spread weights, points per rating, home field, shrink, max margin,
            coach boost strength, and ramp weeks. The row labeled BEST is the formula that was saved as active.
          </p>
        </div>
        <div className="panel table-panel">
          <div className="panel-header">
            <div>
              <h3>Top Candidate Rows</h3>
              <p className="page-subtitle">Sorted by best rank first.</p>
            </div>
          </div>
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
        </div>
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

function fmt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, '') : '';
}
