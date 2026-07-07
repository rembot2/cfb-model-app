'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

type FormulaConfig = {
  name?: string | null;
  pass_weight?: number | string | null;
  rush_weight?: number | string | null;
  overall_weight?: number | string | null;
  composite_weight?: number | string | null;
  points_per_rating?: number | string | null;
  home_field?: number | string | null;
  margin_shrink?: number | string | null;
  max_margin?: number | string | null;
  coach_offense_boost?: number | string | null;
  coach_defense_boost?: number | string | null;
  coach_development_boost?: number | string | null;
  rating_recency_weight?: number | string | null;
  rating_talent_weight?: number | string | null;
  rating_historical_position_weight?: number | string | null;
  rating_preseason_position_weight?: number | string | null;
  rating_talent_ramp_weeks?: number | string | null;
};

const weightOptions = range(0, 1, 0.05);
const pointsOptions = range(0.5, 2.5, 0.1);
const homeFieldOptions = range(0, 5, 0.5);
const shrinkOptions = range(0.5, 1, 0.05);
const maxMarginOptions = range(14.5, 45.5, 1);
const coachBoostOptions = range(0, 3, 0.25);
const recencyOptions = range(1, 5, 0.25);
const splitOptions = range(0, 1, 0.05);
const rampWeekOptions = range(1, 12, 1);
const seasonOptions = [2026, 2025, 2024, 2023, 2022];

export function FormulaControls({ activeConfig }: { activeConfig: FormulaConfig | null }) {
  const [name, setName] = useState(String(activeConfig?.name ?? 'manual-formula'));
  const [runSeason, setRunSeason] = useState(2026);
  const [passWeight, setPassWeight] = useState(value(activeConfig?.pass_weight, 0.3));
  const [rushWeight, setRushWeight] = useState(value(activeConfig?.rush_weight, 0.2));
  const [overallWeight, setOverallWeight] = useState(value(activeConfig?.overall_weight, 0.25));
  const [compositeWeight, setCompositeWeight] = useState(value(activeConfig?.composite_weight, 0.25));
  const [pointsPerRating, setPointsPerRating] = useState(value(activeConfig?.points_per_rating, 1.4));
  const [homeField, setHomeField] = useState(value(activeConfig?.home_field, 2.5));
  const [marginShrink, setMarginShrink] = useState(value(activeConfig?.margin_shrink, 0.75));
  const [maxMargin, setMaxMargin] = useState(value(activeConfig?.max_margin, 24.5));
  const [coachOffenseBoost, setCoachOffenseBoost] = useState(value(activeConfig?.coach_offense_boost, 0.6));
  const [coachDefenseBoost, setCoachDefenseBoost] = useState(value(activeConfig?.coach_defense_boost, 0.6));
  const [coachDevelopmentBoost, setCoachDevelopmentBoost] = useState(value(activeConfig?.coach_development_boost, 1.0));
  const [ratingRecencyWeight, setRatingRecencyWeight] = useState(value(activeConfig?.rating_recency_weight, 2.5));
  const [ratingTalentWeight, setRatingTalentWeight] = useState(value(activeConfig?.rating_talent_weight, 0.4));
  const [ratingHistoricalPositionWeight, setRatingHistoricalPositionWeight] = useState(value(activeConfig?.rating_historical_position_weight, 0.3));
  const [ratingPreseasonPositionWeight, setRatingPreseasonPositionWeight] = useState(value(activeConfig?.rating_preseason_position_weight, 0.7));
  const [ratingTalentRampWeeks, setRatingTalentRampWeeks] = useState(value(activeConfig?.rating_talent_ramp_weeks, 8));
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const normalized = useMemo(() => {
    const total = passWeight + rushWeight + overallWeight + compositeWeight;
    if (!total) return { pass: 0, rush: 0, overall: 0, composite: 0 };
    return {
      pass: passWeight / total,
      rush: rushWeight / total,
      overall: overallWeight / total,
      composite: compositeWeight / total
    };
  }, [passWeight, rushWeight, overallWeight, compositeWeight]);

  async function saveFormula() {
    setBusy(true);
    setStatus('Saving formula...');
    try {
      const response = await fetch('/api/formula', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          name,
          passWeight,
          rushWeight,
          overallWeight,
          compositeWeight,
          pointsPerRating,
          homeField,
          marginShrink,
          maxMargin,
          coachOffenseBoost,
          coachDefenseBoost,
          coachDevelopmentBoost,
          ratingRecencyWeight,
          ratingTalentWeight,
          ratingHistoricalPositionWeight,
          ratingPreseasonPositionWeight,
          ratingTalentRampWeeks
        })
      });
      const json = await readJsonResponse(response);
      if (!response.ok || !json.ok) throw new Error(json.error || 'Save failed');
      setStatus('Saved. This is now the active formula. Use the recalc buttons below to refresh the model outputs.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function runUpdate(label: string, body: Record<string, unknown>) {
    setBusy(true);
    setStatus(`Running ${label}...`);
    try {
      const response = await fetch('/api/formula/run', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const json = await readJsonResponse(response);
      if (!response.ok || !json.ok) throw new Error(json.error || `${label} failed`);
      setStatus(`${label} finished. Refresh the page to see the updated tables.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function runFullRefresh() {
    await runGithubWorkflow('full refresh', '/api/actions/full-refresh', 'Full refresh started in GitHub Actions. It will run ratings, optimizer, backtests, and 2026 predictions.');
  }

  async function runGithubWorkflow(label: string, url: string, successMessage: string, body?: Record<string, unknown>) {
    setBusy(true);
    setStatus(`Starting ${label} in GitHub Actions...`);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: body ? {
          'content-type': 'application/json'
        } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      const json = await readJsonResponse(response);
      if (!response.ok || !json.ok) throw new Error(json.error || `${label} failed to start`);
      setStatus(successMessage);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function runFullOptimizer() {
    await runGithubWorkflow(
      'full optimizer',
      '/api/actions/full-optimizer',
      'Full optimizer started in GitHub Actions. It will update the optimizer table and active formula when it finishes.',
      { season: runSeason >= 2026 ? 2025 : runSeason }
    );
  }

  return (
    <div className="formula-studio">
      <section className="panel formula-command">
        <div className="formula-command-copy">
          <div>
            <span className="eyebrow">Control Center</span>
            <h3>Active Formula Workspace</h3>
            <p className="page-subtitle">Save the formula first, then run whatever refresh job you need.</p>
          </div>
          <div className="formula-command-fields">
            <label>
              Formula Name
              <input value={name} onChange={event => setName(event.target.value)} />
            </label>
            <Select label="Action Season" value={runSeason} options={seasonOptions} onChange={setRunSeason} help="Controls season-specific recalc buttons only." />
          </div>
        </div>

        <div className="formula-weight-strip">
          <WeightChip label="Pass" value={normalized.pass} />
          <WeightChip label="Rush" value={normalized.rush} />
          <WeightChip label="Overall" value={normalized.overall} />
          <WeightChip label="Composite" value={normalized.composite} />
        </div>

        <div className="formula-action-grid">
          <button disabled={busy} onClick={saveFormula}>Save Formula</button>
          <button
            disabled={busy}
            onClick={() => runUpdate('2026 ratings and predictions', {
              season: runSeason,
              steps: ['ratings', 'predictions'],
              optimizeBacktest: false
            })}
          >
            Recalc Ratings
          </button>
          <button
            disabled={busy}
            onClick={() => runGithubWorkflow(
              'all backtests',
              '/api/actions/rebuild-backtests',
              'All backtests started in GitHub Actions. It will rebuild 2022-2025 using the active formula.'
            )}
          >
            Run Backtests
          </button>
          <button disabled={busy} onClick={runFullOptimizer}>Run Optimizer</button>
          <button
            disabled={busy}
            onClick={() => runGithubWorkflow(
              'all ratings',
              '/api/actions/recalculate-ratings',
              'All ratings started in GitHub Actions. It will recalculate 2022-2026 ratings and predictions.'
            )}
          >
            Recalc All Ratings
          </button>
          <button disabled={busy} onClick={runFullRefresh}>Full Refresh</button>
        </div>
        {status ? <p className="status-line">{status}</p> : null}
      </section>

      <div className="formula-card-grid">
        <ControlCard eyebrow="Spread Engine" title="Matchup Weights" detail="Controls which team advantages move the projected spread.">
          <div className="formula-grid compact">
            <Select label="Pass Advantage" value={passWeight} options={weightOptions} onChange={setPassWeight} help="Passing offense versus passing defense." />
            <Select label="Rush Advantage" value={rushWeight} options={weightOptions} onChange={setRushWeight} help="Rushing offense versus rushing defense." />
            <Select label="Overall Advantage" value={overallWeight} options={weightOptions} onChange={setOverallWeight} help="Total offense versus total defense." />
            <Select label="Composite Gap" value={compositeWeight} options={weightOptions} onChange={setCompositeWeight} help="Raw team strength difference." />
          </div>
        </ControlCard>

        <ControlCard eyebrow="Spread Engine" title="Margin Calibration" detail="Turns rating gaps into a readable football line.">
          <div className="formula-grid compact">
            <Select label="Points Per Rating" value={pointsPerRating} options={pointsOptions} onChange={setPointsPerRating} help="Rating edge to scoreboard points." />
            <Select label="Home Field" value={homeField} options={homeFieldOptions} onChange={setHomeField} help="Points added to the home team." />
            <Select label="Margin Shrink" value={marginShrink} options={shrinkOptions} onChange={setMarginShrink} help="Pulls extreme margins back." />
            <Select label="Max Margin" value={maxMargin} options={maxMarginOptions} onChange={setMaxMargin} help="Caps the model spread." />
          </div>
        </ControlCard>

        <ControlCard eyebrow="Ratings Engine" title="Talent + Stats Blend" detail="Controls how team ratings mature as the season gains real games.">
          <div className="formula-grid compact">
            <Select label="Stats Recency" value={ratingRecencyWeight} options={recencyOptions} onChange={setRatingRecencyWeight} help="Higher fades older seasons faster." />
            <Select label="Composite Talent" value={ratingTalentWeight} options={splitOptions} onChange={setRatingTalentWeight} help="Talent share in total rating." />
            <Select label="Early Talent" value={ratingPreseasonPositionWeight} options={splitOptions} onChange={setRatingPreseasonPositionWeight} help="Preseason position talent weight." />
            <Select label="Late Talent" value={ratingHistoricalPositionWeight} options={splitOptions} onChange={setRatingHistoricalPositionWeight} help="Talent weight after ramp." />
            <Select label="Ramp Weeks" value={ratingTalentRampWeeks} options={rampWeekOptions} onChange={setRatingTalentRampWeeks} help="Weeks to reach late-season blend." />
          </div>
        </ControlCard>

        <ControlCard eyebrow="Ratings Engine" title="Coach Influence" detail="Applies coach ratings only after each coach's hire year.">
          <div className="formula-grid compact">
            <Select label="Offense Boost" value={coachOffenseBoost} options={coachBoostOptions} onChange={setCoachOffenseBoost} help="Boost from offensive coach rating." />
            <Select label="Defense Boost" value={coachDefenseBoost} options={coachBoostOptions} onChange={setCoachDefenseBoost} help="Boost from defensive coach rating." />
            <Select label="Development Boost" value={coachDevelopmentBoost} options={coachBoostOptions} onChange={setCoachDevelopmentBoost} help="Composite boost from dev tier." />
          </div>
        </ControlCard>
      </div>

      <section className="panel formula-flow">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Formula Flow</span>
            <h3>How a spread is built</h3>
          </div>
        </div>
        <div className="formula-flow-grid">
          <FormulaStep number="01" title="Rate Teams" detail={`Stats fade by ${(1 / ratingRecencyWeight).toFixed(2)} per season. Talent blend starts at ${percent(ratingPreseasonPositionWeight)} and moves to ${percent(ratingHistoricalPositionWeight)} by week ${ratingTalentRampWeeks.toFixed(0)}.`} />
          <FormulaStep number="02" title="Apply Coaches" detail={`Offense boost ${coachOffenseBoost.toFixed(2)}, defense boost ${coachDefenseBoost.toFixed(2)}, development boost ${coachDevelopmentBoost.toFixed(2)}. Hire year rules prevent future coaches from affecting old seasons.`} />
          <FormulaStep number="03" title="Compare Matchups" detail={`Weighted gap = pass ${percent(normalized.pass)}, rush ${percent(normalized.rush)}, overall ${percent(normalized.overall)}, composite ${percent(normalized.composite)}.`} />
          <FormulaStep number="04" title="Convert To Points" detail={`Raw margin = weighted gap * ${pointsPerRating.toFixed(1)} + ${homeField.toFixed(1)} home-field points.`} />
          <FormulaStep number="05" title="Finish Spread" detail={`Final line = margin * ${marginShrink.toFixed(2)}, capped at ${maxMargin.toFixed(1)} and rounded to the nearest half point.`} />
        </div>
      </section>
    </div>
  );
}

function ControlCard({
  eyebrow,
  title,
  detail,
  children
}: {
  eyebrow: string;
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <section className="panel formula-control-card">
      <div className="panel-header">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
          <p className="page-subtitle">{detail}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function WeightChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="formula-weight-chip">
      <span>{label}</span>
      <strong>{percent(value)}</strong>
      <div className="mini-meter">
        <div style={{ width: percent(value) }} />
      </div>
    </div>
  );
}

function FormulaStep({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <article className="formula-step">
      <span>{number}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </article>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  help
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (value: number) => void;
  help?: string;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={event => onChange(Number(event.target.value))}>
        {options.map(option => (
          <option key={option} value={option}>{formatOption(option)}</option>
        ))}
      </select>
      {help ? <span className="field-help">{help}</span> : null}
    </label>
  );
}

function range(start: number, end: number, step: number) {
  const values: number[] = [];
  for (let value = start; value <= end + 0.0001; value += step) {
    values.push(Number(value.toFixed(2)));
  }
  return values;
}

function value(input: unknown, fallback: number) {
  const n = Number(input);
  return Number.isFinite(n) ? n : fallback;
}

function percent(input: number) {
  return `${Math.round(input * 100)}%`;
}

function formatOption(option: number) {
  return Number.isInteger(option) ? String(option) : option.toFixed(2).replace(/0$/, '');
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text.slice(0, 220) || `Request failed with status ${response.status}`);
  }
}
