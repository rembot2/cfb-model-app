import { CoachControls } from '@/components/CoachControls';
import { fetchFormulaData, fetchTable } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function CoachesPage() {
  const [rows, formula] = await Promise.all([
    fetchTable('coach_configs', 250),
    fetchFormulaData()
  ]);
  rows.sort((a, b) => String(a.team || '').localeCompare(String(b.team || '')));
  const nonNeutral = rows.filter(row =>
    Number(row.offense_rating) !== 5 ||
    Number(row.defense_rating) !== 5 ||
    String(row.development_rating || 'Average') !== 'Average'
  ).length;
  const newHires = rows.filter(row => Number(row.hire_year) >= 2024).length;

  return (
    <>
      <header className="page-hero">
        <div>
          <div className="eyebrow">Coach Inputs</div>
          <h2>Human-adjustable coaching layer.</h2>
          <p className="page-subtitle">
            Set hire years, offense/defense ratings, and development traits. These inputs flow into ratings through the active formula.
          </p>
        </div>
      </header>

      <section className="page-summary-grid">
        <SummaryTile label="Teams" value={String(rows.length)} detail="Coach rows loaded" />
        <SummaryTile label="Non-Neutral" value={String(nonNeutral)} detail="Rows affecting ratings" />
        <SummaryTile label="Recent Hires" value={String(newHires)} detail="2024 or later" />
        <SummaryTile label="Boost Formula" value={`${fmt(formula.activeConfig?.coach_offense_boost)}/${fmt(formula.activeConfig?.coach_defense_boost)}`} detail="Offense / defense" />
      </section>
      <CoachControls initialRows={rows} activeConfig={formula.activeConfig} />
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
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, '') : '-';
}
