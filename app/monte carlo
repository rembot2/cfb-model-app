import { Table } from '@/components/Table';
import {
  CONFERENCE_ORDER,
  PLAYOFF_PICTURE,
  SIMULATIONS,
  TEAM_SIMS,
  WIN_DISTRIBUTIONS
} from '@/lib/data/monte-carlo-2025';

const SEGMENT_COLORS = [
  '#8a6a2b', '#b4863a', '#d8a84e', '#f5d483', '#e9c46a', '#d7d9dc', '#a8a9ad'
];

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

      <section className="panel">
        <div className="panel-header">
          <div>
            <h3>Conference Breakdown</h3>
            <p className="page-subtitle">Same simulation output, grouped by conference and sorted by average wins.</p>
          </div>
        </div>
        <div className="conference-grid">
          {CONFERENCE_ORDER.map(conf => {
            const teams = TEAM_SIMS.filter(t => t.conference === conf).sort((a, b) => b.avgW - a.avgW);
            return (
              <div className="conference-card card" key={conf}>
                <h4>{conf}<span>{teams.length} teams</span></h4>
                <div className="conference-team-list">
                  {teams.map(t => (
                    <div className="conference-team-row" key={t.team}>
                      <span className="ct-rank">#{t.rank}</span>
                      <span className="ct-name">{t.team}</span>
                      <span className="ct-avg">{t.avgW.toFixed(1)}</span>
                      <span className="ct-range">{t.range80}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h3>Win Total Probability Distributions</h3>
            <p className="page-subtitle">Top 20 teams. Each bar shows the share of simulated seasons landing on each win total.</p>
          </div>
        </div>
        <div className="dist-list">
          {WIN_DISTRIBUTIONS.map(team => (
            <div className="dist-row" key={team.team}>
              <div className="dist-name">
                {team.team}
                <small>{team.avgW.toFixed(1)} avg wins</small>
              </div>
              <div className="dist-track" title={team.dist.map(d => `${d.wins}W: ${d.pct}%`).join(' · ')}>
                {team.dist.map((d, i) => (
                  <div
                    key={d.wins}
                    className="dist-segment"
                    style={{ width: `${d.pct}%`, background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
                  >
                    {d.pct >= 8 ? `${d.wins}W` : ''}
                  </div>
                ))}
              </div>
              <div className="dist-avg">{team.avgW.toFixed(1)}</div>
            </div>
          ))}
        </div>
        <div className="dist-legend">
          <span><i style={{ background: '#8a6a2b' }} />Fewer wins</span>
          <span><i style={{ background: '#d8a84e' }} />Mode</span>
          <span><i style={{ background: '#d7d9dc' }} />More wins</span>
          <span style={{ marginLeft: 'auto', color: 'var(--faint)' }}>Hover a bar for the full breakdown</span>
        </div>
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
