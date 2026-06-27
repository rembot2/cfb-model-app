'use client';

import { useEffect, useState } from 'react';

type CoachRow = {
  team?: string | null;
  coach_name?: string | null;
  hire_year?: number | string | null;
  offense_rating?: number | string | null;
  defense_rating?: number | string | null;
  development_rating?: string | null;
  source?: string | null;
};

type FormulaConfig = {
  coach_offense_boost?: number | string | null;
  coach_defense_boost?: number | string | null;
  coach_development_boost?: number | string | null;
};

const ratingOptions = Array.from({ length: 10 }, (_value, index) => index + 1);
const developmentOptions = ['Elite', 'Good', 'Average', 'Poor', 'Terrible'];

export function CoachControls({
  initialRows,
  activeConfig
}: {
  initialRows: CoachRow[];
  activeConfig: FormulaConfig | null;
}) {
  const [rows, setRows] = useState(() => initialRows.map(normalizeRow));
  const [dirtyTeams, setDirtyTeams] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState('');
  const [savingAll, setSavingAll] = useState(false);
  const coachOffenseBoost = numberValue(activeConfig?.coach_offense_boost, 0.6);
  const coachDefenseBoost = numberValue(activeConfig?.coach_defense_boost, 0.6);
  const coachDevelopmentBoost = numberValue(activeConfig?.coach_development_boost, 1.0);

  function updateRow(team: string, patch: Partial<ReturnType<typeof normalizeRow>>) {
    setRows(current => current.map(row => row.team === team ? { ...row, ...patch } : row));
    setDirtyTeams(current => new Set(current).add(team));
  }

  async function saveAllAndRecalculate() {
    const changedRows = rows.filter(row => dirtyTeams.has(row.team));
    setSavingAll(true);
    setStatus(changedRows.length ? `Saving ${changedRows.length} changed coach rows...` : 'No changed coach rows. Recalculating ratings...');
    try {
      const response = await fetch('/api/coaches/save-and-recalc', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          rows: changedRows
        })
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || 'Save/recalculation failed');
      if (Array.isArray(json.coaches)) {
        setRows(json.coaches.map(normalizeRow));
      }
      setDirtyTeams(new Set());
      const ratingsCount = json.result?.ratings?.count ?? 0;
      const predictionCount = json.result?.predictions?.count ?? 0;
      const diagnostics = json.result?.ratings?.coachDiagnostics;
      const matched = diagnostics?.matchedToRatingTeams ?? '?';
      const nonNeutral = diagnostics?.nonNeutralMatched ?? '?';
      setStatus(`Saved ${json.saved ?? changedRows.length} rows. Recalculation finished: ${ratingsCount} ratings and ${predictionCount} predictions updated. Coach matches: ${matched}; changed coaches: ${nonNeutral}. Refresh the Ratings page.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingAll(false);
    }
  }

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        window.location.reload();
      }
    }

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  return (
    <div className="coach-editor">
      <div className="panel coach-toolbar">
        <button disabled={savingAll} onClick={saveAllAndRecalculate}>
          {savingAll ? 'Working' : `Save All + Recalc${dirtyTeams.size ? ` (${dirtyTeams.size})` : ''}`}
        </button>
        <div className="coach-boost-summary">
          <span>Coach O Boost: {fmt(coachOffenseBoost)}</span>
          <span>Coach D Boost: {fmt(coachDefenseBoost)}</span>
          <span>Dev Boost: {fmt(coachDevelopmentBoost)}</span>
        </div>
        <p className="page-subtitle">Edit as many rows as you want, then save all changes and recalculate once.</p>
      </div>

      <div className="table-shell coach-table-shell">
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Coach</th>
              <th className="num">Hire Year</th>
              <th className="num">Offense</th>
              <th className="num">Defense</th>
              <th>Development</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.team}>
                <td>{row.team}</td>
                <td>{row.coachName}</td>
                <td className="num">
                  <input
                    className="coach-year-input"
                    value={row.hireYear}
                    onChange={event => updateRow(row.team, { hireYear: event.target.value })}
                  />
                </td>
                <td className="num">
                  <select value={row.offenseRating} onChange={event => updateRow(row.team, { offenseRating: Number(event.target.value) })}>
                    {ratingOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </td>
                <td className="num">
                  <select value={row.defenseRating} onChange={event => updateRow(row.team, { defenseRating: Number(event.target.value) })}>
                    {ratingOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </td>
                <td>
                  <select value={row.developmentRating} onChange={event => updateRow(row.team, { developmentRating: event.target.value })}>
                    {developmentOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </td>
                <td>{row.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {status ? <p className="status-line">{status}</p> : null}
    </div>
  );
}

function normalizeRow(row: CoachRow) {
  return {
    team: String(row.team ?? ''),
    coachName: String(row.coach_name ?? ''),
    hireYear: row.hire_year == null ? '' : String(row.hire_year),
    offenseRating: ratingValue(row.offense_rating),
    defenseRating: ratingValue(row.defense_rating),
    developmentRating: developmentOptions.includes(String(row.development_rating))
      ? String(row.development_rating)
      : 'Average',
    source: String(row.source ?? '')
  };
}

function ratingValue(value: unknown) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.max(1, Math.min(10, n)) : 5;
}

function numberValue(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmt(value: number) {
  return value.toFixed(2).replace(/\.00$/, '');
}
