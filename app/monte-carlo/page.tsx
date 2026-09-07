import { Table } from '@/components/Table';
import {
  CONFERENCE_ORDER,
  PLAYOFF_PICTURE,
  SIMULATIONS,
  TEAM_SIMS,
  WIN_DISTRIBUTIONS,
  type WinDistribution
} from '@/lib/data/monte-carlo-2025';

const DIST_WIN_VALUES = Array.from(
  new Set(WIN_DISTRIBUTIONS.flatMap(team => team.dist.map(d => d.wins)))
).sort((a, b) => a - b);

export default function MonteCarloPage() {
  const top = TEAM_SIMS[0];
  const highestFloor = [...TEAM_SIMS].sort((a, b) => b.floor - a.floor)[0];
  const mostVolatile = [...TEAM_SIMS].sort((a, b) => b.stdDev - a.stdDev)[0];

  return (
    <>
      <header className="page-hero">
        <div>
          <div className="eyebrow">Simulation Study</div>
          <h2>10,000-season Monte Carlo projections.</h2>
          <p className="page-subtitle">
            Preseason 2025 run of the Phillips-David Model, simulating every FBS team&apos;s full schedule {SIMULATIONS.toLocaleString()} times
            to build a win-total distribution instead of a single point projection.
          </p>
        </div>
      </header>

      <section className="page-summary-grid">
        <SummaryTile label="Simulations Run" value={SIMULATIONS.toLocaleString()} detail="Full seasons per team" />
        <SummaryTile label="Teams Modeled" value={String(TEAM_SIMS.length)} detail="All FBS programs" />
        <SummaryTile label="Highest Avg Wins" value={`${top.team}`} detail={`${top.avgW.toFixed(1)} avg wins`} />
        <SummaryTile label="Safest Floor" value={highestFloor.team} detail={`Never below ${highestFloor.floor} wins`} />
        <SummaryTile label="Most Volatile" value={mostVolatile.team} detail={`±${mostVolatile.stdDev.toFixed(2)} std dev`} />
      </section>

      <section className="panel table-panel">
        <div className="panel-header">
          <div>
            <h3>National Win-Total Board</h3>
            <p className="page-subtitle">
              Ranked by average simulated wins. Floor and ceiling are the worst and best outcomes seen across all {SIMULATIONS.toLocaleString()} simulations; the 80% range excludes the top and bottom deciles.
            </p>
          </div>
        </div>
        <Table
          rows={TEAM_SIMS}
          columns={[
            { label: 'Rank', className: 'num', render: row => String(row.rank) },
            { label: 'Team', render: row => row.team },
            { label: 'Conf', render: row => row.conference },
            { label: 'Avg W', className: 'num', render: row => row.avgW.toFixed(1) },
            { label: 'Median', className: 'num', render: row => row.med.toFixed(1) },
            { label: 'Floor', className: 'num', render: row => String(row.floor) },
            { label: 'Ceiling', className: 'num', render: row => String(row.ceiling) },
            { label: 'Std Dev', className: 'num', render: row => row.stdDev.toFixed(2) },
            { label: '80% Range', render: row => row.range80 }
          ]}
        />
      </section>

      <section className="panel table-panel">
        <div className="panel-header">
          <div>
            <h3>Conference Breakdown</h3>
            <p className="page-subtitle">Same simulation output, grouped by conference and sorted by average wins.</p>
          </div>
        </div>
        {CONFERENCE_ORDER.map(conf => {
          const teams = TEAM_SIMS.filter(t => t.conference === conf).sort((a, b) => b.avgW - a.avgW);
          return (
            <div className="backtest-season-panel" key={conf}>
              <h4 className="conference-table-heading">{conf} <span>{teams.length} teams</span></h4>
              <Table
                rows={teams}
                columns={[
                  { label: 'Rank', className: 'num', render: row => String(row.rank) },
                  { label: 'Team', render: row => row.team },
                  { label: 'Avg W', className: 'num', render: row => row.avgW.toFixed(1) },
                  { label: 'Median', className: 'num', render: row => row.med.toFixed(1) },
                  { label: 'Floor', className: 'num', render: row => String(row.floor) },
                  { label: 'Ceiling', className: 'num', render: row => String(row.ceiling) },
                  { label: 'Std Dev', className: 'num', render: row => row.stdDev.toFixed(2) },
                  { label: '80% Range', render: row => row.range80 }
                ]}
              />
            </div>
          );
        })}
      </section>

      <section className="panel table-panel">
        <div className="panel-header">
          <div>
            <h3>Win Total Probability Distributions</h3>
            <p className="page-subtitle">Top 20 teams. Share of the {SIMULATIONS.toLocaleString()} simulated seasons landing on each win total.</p>
          </div>
        </div>
        <Table
          rows={WIN_DISTRIBUTIONS}
          columns={[
            { label: 'Team', render: row => row.team },
            { label: 'Avg W', className: 'num', render: row => row.avgW.toFixed(1) },
            ...DIST_WIN_VALUES.map(wins => ({
              label: `${wins}W`,
              className: 'num',
              render: (row: WinDistribution) => {
                const entry = row.dist.find(d => d.wins === wins);
                return entry ? `${entry.pct}%` : '–';
              }
            }))
          ]}
        />
      </section>

      <section className="panel table-panel">
        <div className="panel-header">
          <div>
            <h3>Playoff Picture</h3>
            <p className="page-subtitle">Probability of clearing each win threshold across all simulated seasons.</p>
          </div>
        </div>
        <Table
          rows={PLAYOFF_PICTURE}
          columns={[
            { label: 'Team', render: row => row.team },
            { label: '10+ Wins', className: 'num', render: row => `${row.tenPlus.toFixed(1)}%` },
            { label: '9+ Wins', className: 'num', render: row => `${row.ninePlus.toFixed(1)}%` },
            { label: '8+ Wins', className: 'num', render: row => `${row.eightPlus.toFixed(1)}%` },
            { label: 'Avg Wins', className: 'num', render: row => row.avgW.toFixed(1) }
          ]}
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
