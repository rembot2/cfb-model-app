'use client';

import { useState } from 'react';

type CoachRow = {
  team?: string | null;
  coach_name?: string | null;
  hire_year?: number | string | null;
  offense_rating?: number | string | null;
  defense_rating?: number | string | null;
  development_rating?: string | null;
  source?: string | null;
};

const ratingOptions = Array.from({ length: 10 }, (_value, index) => index + 1);
const developmentOptions = ['Elite', 'Good', 'Average', 'Poor', 'Terrible'];

export function CoachControls({ initialRows }: { initialRows: CoachRow[] }) {
  const [secret, setSecret] = useState('');
  const [rows, setRows] = useState(() => initialRows.map(normalizeRow));
  const [status, setStatus] = useState('');
  const [savingTeam, setSavingTeam] = useState('');

  function updateRow(team: string, patch: Partial<ReturnType<typeof normalizeRow>>) {
    setRows(current => current.map(row => row.team === team ? { ...row, ...patch } : row));
  }

  async function saveRow(row: ReturnType<typeof normalizeRow>) {
    if (!secret.trim()) {
      setStatus('Enter your CRON_SECRET first. It is the same secret you use on the Formula page.');
      return;
    }

    setSavingTeam(row.team);
    setStatus(`Saving ${row.team}...`);
    try {
      const response = await fetch('/api/coaches', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${secret.trim()}`
        },
        body: JSON.stringify({
          team: row.team,
          hireYear: row.hireYear,
          offenseRating: row.offenseRating,
          defenseRating: row.defenseRating,
          developmentRating: row.developmentRating
        })
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || 'Save failed');
      setStatus(`Saved ${row.team}. Recalculate ratings when you are done editing coaches.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingTeam('');
    }
  }

  return (
    <div className="coach-editor">
      <div className="panel coach-toolbar">
        <label>
          Admin Secret
          <input
            value={secret}
            onChange={event => setSecret(event.target.value)}
            type="password"
            placeholder="CRON_SECRET"
          />
        </label>
        <p className="page-subtitle">Change coach ratings here, then save each row you edit.</p>
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
              <th>Save</th>
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
                <td>
                  <button disabled={savingTeam === row.team} onClick={() => saveRow(row)}>
                    {savingTeam === row.team ? 'Saving' : 'Save'}
                  </button>
                </td>
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
