'use client';

import { useMemo, useState } from 'react';

type PredictorData = {
  seasons: number[];
  selectedSeason: number | null;
  teamsBySeason: Record<string, string[]>;
};

type PredictionResponse = {
  ok: boolean;
  error?: string;
  season?: number;
  teamA?: string;
  teamB?: string;
  homeTeam?: string;
  awayTeam?: string;
  prediction?: {
    spread: string;
    predictedWinner: string;
    predictedMargin: number;
    teamAMargin: number;
    teamBMargin: number;
    teamAWinProbability: number;
    teamBWinProbability: number;
    teamAScore: number;
    teamBScore: number;
    passAdv: number;
    rushAdv: number;
    overallAdv: number;
    compositeAdv: number;
    weightedRatingGap: number;
    modelHomeMargin: number;
    homePassRate: number;
    awayPassRate: number;
    scoreProjection: {
      projectedTotal: number;
      paceFactor: number;
      teamAExpected: number;
      teamBExpected: number;
      mode: 'preseason' | 'full-season';
      explanation: string;
    };
  };
  ratings?: Record<string, {
    composite: number;
    offRating: number;
    defRating: number;
    rushOff: number;
    passOff: number;
    rushDef: number;
    passDef: number;
  }>;
  formula?: {
    name: string;
    weights: {
      pass: number;
      rush: number;
      overall: number;
      composite: number;
    };
    calibration: {
      pointsPerRating: number;
      homeField: number;
      marginShrink: number;
      maxMargin: number;
    };
  };
};

type DisplayRating = NonNullable<PredictionResponse['ratings']>[string];

export function MatchupPredictor({ data }: { data: PredictorData }) {
  const [season, setSeason] = useState(data.selectedSeason ?? data.seasons[0] ?? 2026);
  const teams = useMemo(() => data.teamsBySeason[String(season)] ?? [], [data.teamsBySeason, season]);
  const [teamA, setTeamA] = useState(teams[0] ?? '');
  const [teamB, setTeamB] = useState(teams[1] ?? '');
  const [site, setSite] = useState<'teamA' | 'teamB' | 'neutral'>('teamA');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<PredictionResponse | null>(null);

  function changeSeason(nextSeason: number) {
    const nextTeams = data.teamsBySeason[String(nextSeason)] ?? [];
    setSeason(nextSeason);
    setTeamA(nextTeams[0] ?? '');
    setTeamB(nextTeams[1] ?? '');
    setResult(null);
    setStatus('');
  }

  async function predict() {
    setBusy(true);
    setStatus('Calculating matchup...');
    try {
      const response = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ season, teamA, teamB, site })
      });
      const json = await response.json() as PredictionResponse;
      if (!response.ok || !json.ok) throw new Error(json.error || 'Prediction failed');
      setResult(json);
      setStatus('');
    } catch (error) {
      setResult(null);
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="predictor-shell">
      <section className="panel predictor-controls">
        <div className="panel-header">
          <div>
            <h3>Matchup Inputs</h3>
            <p className="page-subtitle">Set the matchup once, then use the output panel as your game preview.</p>
          </div>
        </div>

        <div className="predictor-grid">
          <label>
            Season
            <select value={season} onChange={event => changeSeason(Number(event.target.value))}>
              {data.seasons.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
          <TeamSelect label="Team 1" value={teamA} teams={teams} onChange={setTeamA} />
          <TeamSelect label="Team 2" value={teamB} teams={teams} onChange={setTeamB} />
          <label>
            Site
            <select value={site} onChange={event => setSite(event.target.value as 'teamA' | 'teamB' | 'neutral')}>
              <option value="teamA">{teamA || 'Team 1'} home</option>
              <option value="teamB">{teamB || 'Team 2'} home</option>
              <option value="neutral">Neutral</option>
            </select>
          </label>
        </div>

        <div className="button-row predictor-actions">
          <button disabled={busy || !teamA || !teamB || teamA === teamB} onClick={predict}>Predict Game</button>
        {status ? <span className="status-text">{status}</span> : null}
        </div>
      </section>

      <div className="predictor-stage">
        {result?.prediction ? (
          <PredictionResult result={result} />
        ) : (
          <section className="panel predictor-empty">
            <div className="panel-header">
              <h3>Projection Board</h3>
              <span className="muted">waiting for matchup</span>
            </div>
            <p>Choose two teams and run the model to see the projected spread, score, win probability, and matchup edges.</p>
          </section>
        )}
      </div>
    </div>
  );
}

function TeamSelect({ label, value, teams, onChange }: { label: string; value: string; teams: string[]; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <select value={value} onChange={event => onChange(event.target.value)}>
        {teams.map(team => (
          <option key={team} value={team}>{team}</option>
        ))}
      </select>
    </label>
  );
}

function PredictionResult({ result }: { result: PredictionResponse }) {
  const prediction = result.prediction!;
  const teamA = result.teamA || 'Team 1';
  const teamB = result.teamB || 'Team 2';
  const ratingA = result.ratings?.[teamA];
  const ratingB = result.ratings?.[teamB];

  return (
    <div className="predictor-results">
      <section className="grid kpi-grid predictor-kpis">
        <Kpi label="Projected Spread" value={prediction.spread} detail={`${result.homeTeam} home field context`} />
        <Kpi
          label="Projected Score"
          value={`${teamA} ${prediction.teamAScore} - ${teamB} ${prediction.teamBScore}`}
          detail={`${prediction.scoreProjection.explanation} | Total ${fmt(prediction.scoreProjection.projectedTotal)}`}
        />
        <Kpi label={`${teamA} Win %`} value={pct(prediction.teamAWinProbability * 100)} detail={`${teamB}: ${pct(prediction.teamBWinProbability * 100)}`} />
        <Kpi label="Rating Gap" value={fmt(prediction.weightedRatingGap)} detail={`Margin: ${fmt(Math.abs(prediction.teamAMargin))} pts`} />
      </section>

      <section className="grid predictor-detail-grid">
        <div className="panel">
          <div className="panel-header">
            <h3>Matchup Edges</h3>
            <span className="muted">positive favors home team</span>
          </div>
          <EdgeBar label="Pass Edge" value={prediction.passAdv} />
          <EdgeBar label="Rush Edge" value={prediction.rushAdv} />
          <EdgeBar label="Overall Edge" value={prediction.overallAdv} />
          <EdgeBar label="Composite Edge" value={prediction.compositeAdv} />
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>Team Ratings</h3>
            <span className="muted">{result.season}</span>
          </div>
          <RatingCompare team={teamA} rating={ratingA} />
          <RatingCompare team={teamB} rating={ratingB} />
          <dl className="score-context">
            <div><dt>Scoring mode</dt><dd>{prediction.scoreProjection.mode === 'preseason' ? 'Preseason only' : 'Full season'}</dd></div>
            <div><dt>Projected total</dt><dd>{fmt(prediction.scoreProjection.projectedTotal)}</dd></div>
            <div><dt>Pace factor</dt><dd>{fmt(prediction.scoreProjection.paceFactor)}</dd></div>
          </dl>
        </div>
      </section>

      <section className="panel predictor-formula-panel">
          <div className="panel-header">
            <h3>Formula Used</h3>
            <span className="muted">{result.formula?.name || 'active'}</span>
          </div>
          <dl className="formula-mini">
            <div><dt>Pass</dt><dd>{fmtWeight(result.formula?.weights.pass)}</dd></div>
            <div><dt>Rush</dt><dd>{fmtWeight(result.formula?.weights.rush)}</dd></div>
            <div><dt>Overall</dt><dd>{fmtWeight(result.formula?.weights.overall)}</dd></div>
            <div><dt>Composite</dt><dd>{fmtWeight(result.formula?.weights.composite)}</dd></div>
            <div><dt>Home Field</dt><dd>{fmt(result.formula?.calibration.homeField)}</dd></div>
            <div><dt>Shrink</dt><dd>{fmt(result.formula?.calibration.marginShrink)}</dd></div>
          </dl>
      </section>
    </div>
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

function EdgeBar({ label, value }: { label: string; value: number }) {
  const width = Math.min(100, Math.abs(value) * 8);
  const positive = value >= 0;
  return (
    <div className="edge-row">
      <div className="edge-meta">
        <span>{label}</span>
        <strong>{fmt(value)}</strong>
      </div>
      <div className="edge-track">
        <div className={positive ? 'edge-fill positive' : 'edge-fill negative'} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function RatingCompare({ team, rating }: { team: string; rating?: DisplayRating }) {
  if (!rating) return null;
  return (
    <div className="rating-compare">
      <strong>{team}</strong>
      <div>
        <span>Comp {fmt(rating.composite)}</span>
        <span>Off {fmt(rating.offRating)}</span>
        <span>Def {fmt(rating.defRating)}</span>
      </div>
      <small>Pass {fmt(rating.passOff)} / Rush {fmt(rating.rushOff)} offense</small>
    </div>
  );
}

function fmt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, '') : '-';
}

function pct(value: number) {
  return `${fmt(value)}%`;
}

function fmtWeight(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? `${(n * 100).toFixed(0)}%` : '-';
}
