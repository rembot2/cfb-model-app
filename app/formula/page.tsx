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
        <h3>Ratings Definition</h3>
        <p>
          Team ratings start with on-field team stats, roster talent, position talent, and coach inputs. The stats side uses PPA,
          success rate, points per drive, rush PPA, and pass PPA, with older seasons reduced by the recency setting.
        </p>
        <p>
          Position ratings are built from each team's roster by position group. Rush offense is driven by RB and OL, pass offense by
          QB, WR, TE, and OL, rush defense by DL and LB, and pass defense by DL, CB, and S.
        </p>
        <p>
          Early in a season, pass/rush ratings trust talent more. Each week, the model moves toward the late-season talent setting,
          which means stats gradually take over as more real games are played.
        </p>
        <p>
          Coach offense and defense ratings are passive boosts to offense and defense. Development is a passive composite boost.
          A coach only affects seasons after his hire year, so a 2026 hire will not change 2022-2025 ratings.
        </p>
        <p>
          Game predictions compare the home team's pass, rush, overall, and composite advantages against the away team, convert
          the weighted gap into points, add home field, shrink extreme margins, cap the maximum margin, and round to the nearest
          half-point spread.
        </p>
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
