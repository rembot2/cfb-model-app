import { SeasonSelect } from '@/components/SeasonSelect';
import { Table } from '@/components/Table';
import { fetchBacktestResultsSeason } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function BacktestResultsPage({ searchParams }: { searchParams?: { season?: string } }) {
  const requestedSeason = Number(searchParams?.season);
  const data = await fetchBacktestResultsSeason(Number.isFinite(requestedSeason) ? requestedSeason : undefined);
  const vegasWins = data.games.filter(row => String(row.model_vegas_result ?? '').toUpperCase() === 'WIN').length;
  const vegasLosses = data.games.filter(row => String(row.model_vegas_result ?? '').toUpperCase() === 'LOSS').length;
  const modelCorrect = data.games.filter(row => String(row.pick_result ?? '').toUpperCase() === 'CORRECT').length;

  return (
    <>
      <header className="page-hero">
        <div>
          <div className="eyebrow">Game Audit</div>
          <h2>{data.season ?? ''} backtest game log.</h2>
          <p className="page-subtitle">
            Every historical prediction with Vegas comparison, model spread, actual margin, and whether the model picked the winner.
          </p>
        </div>
        <div className="page-hero-actions">
          <SeasonSelect seasons={data.seasons} selected={data.season} />
        </div>
      </header>

      <section className="page-summary-grid">
        <SummaryTile label="Games" value={String(data.games.length)} detail={`${data.season ?? '-'} season`} />
        <SummaryTile label="Winner Picks" value={pct(modelCorrect, data.games.length)} detail={`${modelCorrect} correct`} />
        <SummaryTile label="Vegas Edge" value={pct(vegasWins, vegasWins + vegasLosses)} detail={`${vegasWins}-${vegasLosses}`} />
        <SummaryTile label="Avg Error" value={avg(data.games.map(row => Number(row.margin_error)))} detail="Projected vs actual margin" />
        <SummaryTile label="ML Accuracy" value={pct(data.games.filter(row => row['ml_home_margin'] != null && ((Number(row['ml_home_margin']) > 0) === (Number(row['home_margin']) > 0))).length, data.games.filter(row => row['ml_home_margin'] != null).length)} detail="ML winner picks" />      </section>

      <section className="panel table-panel">
        <div className="panel-header">
          <div>
            <h3>Prediction Ledger</h3>
            <p className="page-subtitle">Sorted by model week, then away team. Use this page to audit individual misses.</p>
          </div>
        </div>
        <Table
          rows={data.games}
          columns={[
            { label: 'Week', className: 'num', render: row => String(row.week_label ?? row.week ?? '') },
            { label: 'Away', render: row => String(row.away_team ?? '') },
            { label: 'Home', render: row => String(row.home_team ?? '') },
            { label: 'Vegas Spread', render: row => String(row.vegas_spread ?? '') },
            { label: 'Model Spread', render: row => String(row.model_spread ?? '') },
            { label: 'Model-Vegas Diff', className: 'num', render: row => fmt(row.model_vegas_diff) },
            { label: 'Model Pick', render: row => String(row.model_vegas_pick ?? '') },
            { label: 'Vegas Result', render: row => <Pill value={String(row.model_vegas_result ?? '')} /> },
            { label: 'ATS Margin', className: 'num', render: row => fmt(row.model_vegas_ats_margin) },
            { label: 'Home Pts', className: 'num', render: row => String(row.home_pts ?? '') },
            { label: 'Away Pts', className: 'num', render: row => String(row.away_pts ?? '') },
            { label: 'Home Margin', className: 'num', render: row => String(row.home_margin ?? '') },
            { label: 'Actual Result', render: row => String(row.actual_result ?? '') },
            { label: 'Predicted Favorite', render: row => String(row.predicted_favorite ?? '') },
            { label: 'Predicted Margin', className: 'num', render: row => fmt(row.predicted_margin) },
            { label: 'Model Home Margin', className: 'num', render: row => fmt(row.model_home_margin) },
            { label: 'Actual Winner', render: row => String(row.actual_winner ?? '') },
            { label: 'Actual Win Margin', className: 'num', render: row => fmt(row.actual_win_margin) },
            { label: 'Margin Error', className: 'num', render: row => fmt(row.margin_error) },
            { label: 'Error Bucket', render: row => String(row.error_bucket ?? '') },
            { label: 'Winner Pick', render: row => <Pill value={String(row.pick_result ?? '')} /> },
            { label: 'ML Margin', className: 'num', render: row => row['ml_home_margin'] != null ? fmt(row['ml_home_margin']) : '-' },
            { label: 'ML Win Prob', className: 'num', render: row => row['ml_win_prob_home'] != null ? `${fmt(Number(row['ml_win_prob_home']) * 100)}%` : '-' },
            { label: 'ML Pick', render: row => row['ml_home_margin'] != null ? <Pill value={(Number(row['ml_home_margin']) > 0) === (Number(row['home_margin']) > 0) ? 'CORRECT' : 'WRONG'} /> : null }          ]}
        />
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

function Pill({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  const cls = ['WIN', 'CORRECT'].includes(normalized)
    ? 'win'
    : ['LOSS', 'WRONG', 'INCORRECT'].includes(normalized)
      ? 'loss'
      : '';
  return value ? <span className={`pill ${cls}`}>{value}</span> : null;
}

function fmt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, '') : '';
}

function pct(wins: number, total: number) {
  return total ? `${fmt((wins / total) * 100)}%` : '-';
}

function avg(values: number[]) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return '-';
  return fmt(clean.reduce((sum, value) => sum + value, 0) / clean.length);
}
