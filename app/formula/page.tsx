import { FormulaControls } from '@/components/FormulaControls';
import { Table } from '@/components/Table';
import { fetchFormulaData } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function FormulaPage() {
  const { activeConfig, recentConfigs, optimizer } = await fetchFormulaData();

  return (
    <>
      <header className="page-hero">
        <div>
          <div className="eyebrow">Formula Studio</div>
          <h2>Tune the model without touching code.</h2>
          <p className="page-subtitle">
            Adjust spread weights, coach boosts, talent/stat blend, and refresh jobs from one control center.
          </p>
        </div>
      </header>

      <section className="page-summary-grid">
        <SummaryTile label="Active Formula" value={String(activeConfig?.name ?? '-')} detail="Currently used by predictions" />
        <SummaryTile label="Pass / Rush" value={`${fmt(activeConfig?.pass_weight)}/${fmt(activeConfig?.rush_weight)}`} detail="Spread matchup weights" />
        <SummaryTile label="Coach Boosts" value={`${fmt(activeConfig?.coach_offense_boost)}/${fmt(activeConfig?.coach_defense_boost)}`} detail="Offense / defense boost" />
        <SummaryTile label="Ramp Weeks" value={fmt(activeConfig?.rating_talent_ramp_weeks) || '-'} detail="Talent-to-stats transition" />
      </section>

      <FormulaControls activeConfig={activeConfig} />

      <div className="grid formula-tables">
        <section className="panel table-panel">
          <div className="panel-header">
            <div>
              <h3>Recent Formulas</h3>
              <p className="page-subtitle">Saved formula versions, newest first.</p>
            </div>
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
              { label: 'Dev', className: 'num', render: row => fmt(row.coach_development_boost) },
              { label: 'Recency', className: 'num', render: row => fmt(row.rating_recency_weight) },
              { label: 'Talent', className: 'num', render: row => fmt(row.rating_talent_weight) },
              { label: 'Hist Pos', className: 'num', render: row => fmt(row.rating_historical_position_weight) },
              { label: 'Pre Pos', className: 'num', render: row => fmt(row.rating_preseason_position_weight) },
              { label: 'Ramp Wks', className: 'num', render: row => fmt(row.rating_talent_ramp_weeks) }
            ]}
          />
        </section>

        <section className="panel table-panel">
          <div className="panel-header">
            <div>
              <h3>Best Optimizer Rows</h3>
              <p className="page-subtitle">Top rows from the most recent optimizer run.</p>
            </div>
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
              { label: 'Coach O', className: 'num', render: row => fmt(row.coach_offense_boost) },
              { label: 'Coach D', className: 'num', render: row => fmt(row.coach_defense_boost) },
              { label: 'Dev', className: 'num', render: row => fmt(row.coach_development_boost) },
              { label: 'Ramp Wks', className: 'num', render: row => fmt(row.rating_talent_ramp_weeks) },
              { label: 'Score', className: 'num', render: row => fmt(row.final_score) }
            ]}
          />
        </section>
      </div>

      <section className="panel formula-reference">
        <div className="panel-header">
          <div>
            <h3>Model Map</h3>
            <p className="page-subtitle">A quick reference for what each part of the formula controls.</p>
          </div>
        </div>
        <div className="definition-grid">
          <DefinitionCard label="Team Stats">
            PPA, success rate, points per drive, rush PPA, and pass PPA form the performance side of each rating.
          </DefinitionCard>
          <DefinitionCard label="Roster Talent">
            Position groups are built from the roster, then blended with stats based on the talent weights and ramp weeks.
          </DefinitionCard>
          <DefinitionCard label="Coaching">
            Offense and defense coach scores boost those sides of the ball. Development boosts composite only.
          </DefinitionCard>
          <DefinitionCard label="Timing">
            Older stats fade by recency, and coach boosts only apply after the coach's hire year.
          </DefinitionCard>
          <DefinitionCard label="Spread">
            Pass, rush, overall, and composite advantages become a projected margin, then shrink and cap rules shape the final line.
          </DefinitionCard>
        </div>
      </section>
    </>
  );
}

function DefinitionCard({ label, children }: { label: string; children: string }) {
  return (
    <article className="definition-card">
      <span>{label}</span>
      <p>{children}</p>
    </article>
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
