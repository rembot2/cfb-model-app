import { SeasonSelect } from '@/components/SeasonSelect';
import { Table } from '@/components/Table';
import { fetchBacktestResultsSeason } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function BacktestResultsPage({ searchParams }: { searchParams?: { season?: string } }) {
  const requestedSeason = Number(searchParams?.season);
  const data = await fetchBacktestResultsSeason(Number.isFinite(requestedSeason) ? requestedSeason : undefined);

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">Backtest</div>
          <h2>Game Results</h2>
        </div>
        <SeasonSelect seasons={data.seasons} selected={data.season} />
      </header>

      <Table
        rows={data.games}
        columns={[
          { label: 'Week', className: 'num', render: row => String(row.week ?? '') },
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
          { label: 'Winner Pick', render: row => <Pill value={String(row.pick_result ?? '')} /> }
        ]}
      />
    </>
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
