import { BarList } from '@/components/BarList';
import { fetchDashboardData } from '@/lib/db/queries';

export default async function DashboardPage() {
  const data = await fetchDashboardData();
  const latestSeason = Math.max(0, ...data.ratings.map(row => Number(row.season) || 0));
  const ratings = data.ratings
    .filter(row => Number(row.season) === latestSeason)
    .sort((a, b) => Number(b.composite || 0) - Number(a.composite || 0));
  const top = ratings[0] ?? {};
  const overall = data.summary.find(row => String(row.week).toUpperCase() === 'OVERALL') ?? {};
  const best = data.optimizer.find(row => String(row.use_this).toUpperCase() === 'BEST') ?? data.optimizer[0] ?? {};
  const spreadBuckets = data.buckets.filter(row => row.bucket_type === 'spread');
  const vegasBuckets = data.buckets.filter(row => row.bucket_type === 'vegas_diff');

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">Version 3</div>
          <h2>Dashboard</h2>
        </div>
      </header>

      <section className="grid kpi-grid">
        <Kpi label="Top Team" value={String(top.team ?? '-')} detail={`Composite ${format(top.composite)}`} />
        <Kpi label="Vegas Edge Win %" value={pct(overall.vegas_edge_win_pct)} detail={record(overall)} />
        <Kpi label="Backtest Pick %" value={pct(overall.pick_pct)} detail={`Avg margin error ${format(overall.avg_margin_error)}`} />
        <Kpi label="Best Final Score" value={format(best.final_score)} detail={weights(best)} />
      </section>

      <section className="grid dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <h3>Top Ratings</h3>
            <span className="muted">{latestSeason || '-'}</span>
          </div>
          <BarList items={ratings.slice(0, 15).map(row => ({ name: String(row.team), value: Number(row.composite) || 0 }))} />
        </div>
        <div className="panel">
          <div className="panel-header">
            <h3>Spread Buckets</h3>
            <span className="muted">pick rate</span>
          </div>
          <BarList items={spreadBuckets.map(row => ({ name: String(row.bucket), value: Number(row.pick_pct) || 0, suffix: '%' }))} />
        </div>
        <div className="panel">
          <div className="panel-header">
            <h3>Vegas Difference</h3>
            <span className="muted">pick rate</span>
          </div>
          <BarList items={vegasBuckets.map(row => ({ name: String(row.bucket), value: Number(row.pick_pct) || 0, suffix: '%' }))} />
        </div>
      </section>
    </>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function format(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(2).replace(/\.00$/, '');
}

function pct(value: unknown) {
  const formatted = format(value);
  return formatted === '-' ? '-' : `${formatted}%`;
}

function record(row: Record<string, unknown>) {
  const plays = Number(row.vegas_edge_plays || 0);
  if (!plays) return 'No edge plays loaded';
  return `${row.vegas_edge_wins ?? 0}-${row.vegas_edge_losses ?? 0}-${row.vegas_edge_pushes ?? 0}`;
}

function weights(row: Record<string, unknown>) {
  if (row.pass_weight === undefined) return 'Weights -';
  return `P ${row.pass_weight} / R ${row.rush_weight} / O ${row.overall_weight} / C ${row.composite_weight}`;
}
