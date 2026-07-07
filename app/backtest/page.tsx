import type { CSSProperties } from 'react';
import { SeasonSelect } from '@/components/SeasonSelect';
import { fetchBacktestSeason, type BacktestWeekSummary } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function BacktestPage({ searchParams }: { searchParams?: { season?: string } }) {
  const requestedSeason = Number(searchParams?.season);
  const data = await fetchBacktestSeason(Number.isFinite(requestedSeason) ? requestedSeason : undefined);
  const rows = [...data.weeklyRows, data.seasonTotal];

  return (
    <>
      <header className="page-hero">
        <div>
          <div className="eyebrow">Validation</div>
          <h2>Backtest performance report.</h2>
          <p className="page-subtitle">
            Review the model by season, week, margin error, and market-edge results. The total row is recalculated from game-level predictions.
          </p>
        </div>
        <div className="page-hero-actions">
          <SeasonSelect seasons={data.seasons} selected={data.season} />
        </div>
      </header>

      <section className="rating-rings">
        <MetricRing label="Overall Pick %" value={data.overall.pick_pct} mode="pct" />
        <MetricRing label="Avg Margin Error" value={data.overall.avg_margin_error} mode="error" />
        <MetricRing label="Vegas Edge Win %" value={data.overall.vegas_edge_win_pct} mode="pct" />
      </section>

      <section className="page-summary-grid">
        <SummaryTile label="Season Games" value={String(data.seasonTotal.games)} detail={`${data.season ?? '-'} selected`} />
        <SummaryTile label="Season Pick %" value={pct(data.seasonTotal.pick_pct) || '-'} detail={`${data.seasonTotal.picks_correct}-${data.seasonTotal.picks_wrong}`} />
        <SummaryTile label="Within 7" value={countPct(data.seasonTotal.within_7, data.seasonTotal.within_7_pct)} detail="Margin error check" />
        <SummaryTile label="Vegas Edge" value={pct(data.seasonTotal.vegas_edge_win_pct) || '-'} detail={record(data.seasonTotal)} />
      </section>

      <section className="panel table-panel backtest-season-panel">
        <div className="panel-header">
          <div>
            <h3>{data.season ?? '-'} Weekly Results</h3>
            <p className="page-subtitle">Use this to spot which weeks the model handled well or missed.</p>
          </div>
          <span className="muted">Totals recalculated from games</span>
        </div>
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Week</th>
                <th className="num">Games</th>
                <th className="num">Correct</th>
                <th className="num">Wrong</th>
                <th className="num">Pick %</th>
                <th className="num">Avg Error</th>
                <th className="num">Median Error</th>
                <th className="num">Within 3</th>
                <th className="num">Within 7</th>
                <th className="num">Within 10</th>
                <th className="num">Vegas Plays</th>
                <th className="num">Vegas W-L-P</th>
                <th className="num">Vegas Win %</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map(row => (
                <tr key={String(row.week)} className={String(row.week).includes('TOTAL') ? 'summary-total-row' : undefined}>
                  <td>{row.week}</td>
                  <td className="num">{row.games}</td>
                  <td className="num">{row.picks_correct}</td>
                  <td className="num">{row.picks_wrong}</td>
                  <td className="num">{pct(row.pick_pct)}</td>
                  <td className="num">{fmt(row.avg_margin_error)}</td>
                  <td className="num">{fmt(row.median_margin_error)}</td>
                  <td className="num">{countPct(row.within_3, row.within_3_pct)}</td>
                  <td className="num">{countPct(row.within_7, row.within_7_pct)}</td>
                  <td className="num">{countPct(row.within_10, row.within_10_pct)}</td>
                  <td className="num">{row.vegas_edge_plays}</td>
                  <td className="num">{record(row)}</td>
                  <td className="num">{pct(row.vegas_edge_win_pct)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={13}>No backtest rows loaded for this season.</td>
                </tr>
              )}
            </tbody>
          </table>
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

function MetricRing({ label, value, mode }: { label: string; value: number | null; mode: 'pct' | 'error' }) {
  const n = Number(value);
  const display = Number.isFinite(n) ? (mode === 'pct' ? `${fmt(n)}%` : fmt(n)) : '-';
  const pctValue = Number.isFinite(n)
    ? mode === 'pct'
      ? Math.max(0, Math.min(100, n))
      : Math.max(0, Math.min(100, 100 - (n / 30) * 100))
    : 0;

  return (
    <div className="rating-ring-card">
      <div className="rating-ring" style={{ '--rating-pct': `${pctValue}%` } as CSSProperties}>
        <div className="rating-ring-inner">{display}</div>
      </div>
      <div className="rating-ring-label">{label}</div>
    </div>
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

function countPct(count: number, percent: number | null) {
  return `${count} (${pct(percent) || '0%'})`;
}

function record(row: BacktestWeekSummary) {
  return `${row.vegas_edge_wins}-${row.vegas_edge_losses}-${row.vegas_edge_pushes}`;
}
