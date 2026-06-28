'use client';

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

  return (
    <div className="formula-layout">
      <section className="panel formula-panel">
        <div className="panel-header">
          <div>
            <h3>Editable Formula</h3>
            <p className="page-subtitle">Change the model knobs here instead of editing code.</p>
          </div>
        </div>

        <div className="formula-grid">
          <label>
            Formula Name
            <input value={name} onChange={event => setName(event.target.value)} />
          </label>
          <Select label="Run Buttons Season" value={runSeason} options={seasonOptions} onChange={setRunSeason} help="Only controls which season the Recalc Ratings, Backtest, and Optimizer buttons run." />
          <Select label="Pass Advantage Weight" value={passWeight} options={weightOptions} onChange={setPassWeight} help="How much the game spread rewards passing offense versus the opponent passing defense." />
          <Select label="Rush Advantage Weight" value={rushWeight} options={weightOptions} onChange={setRushWeight} help="How much the game spread rewards rushing offense versus the opponent rushing defense." />
          <Select label="Overall Advantage Weight" value={overallWeight} options={weightOptions} onChange={setOverallWeight} help="How much the spread uses total offense versus total defense matchup edges." />
          <Select label="Composite Advantage Weight" value={compositeWeight} options={weightOptions} onChange={setCompositeWeight} help="How much the spread uses the simple team composite gap." />
          <Select label="Points Per Rating" value={pointsPerRating} options={pointsOptions} onChange={setPointsPerRating} help="Turns a rating-point edge into projected scoreboard points." />
          <Select label="Home Field" value={homeField} options={homeFieldOptions} onChange={setHomeField} help="Points added to the home team's predicted margin." />
          <Select label="Margin Shrink" value={marginShrink} options={shrinkOptions} onChange={setMarginShrink} help="Pulls extreme predicted margins back toward zero." />
          <Select label="Max Margin" value={maxMargin} options={maxMarginOptions} onChange={setMaxMargin} help="Hard cap so one team cannot be projected above this margin." />
          <Select label="Coach Offense Boost" value={coachOffenseBoost} options={coachBoostOptions} onChange={setCoachOffenseBoost} help="Multiplier for each coach's 1-10 offensive rating." />
          <Select label="Coach Defense Boost" value={coachDefenseBoost} options={coachBoostOptions} onChange={setCoachDefenseBoost} help="Multiplier for each coach's 1-10 defensive rating." />
          <Select label="Coach Development Boost" value={coachDevelopmentBoost} options={coachBoostOptions} onChange={setCoachDevelopmentBoost} help="Multiplier for Elite/Good/Average/Poor/Terrible development tiers." />
          <Select label="Stats Recency Weight" value={ratingRecencyWeight} options={recencyOptions} onChange={setRatingRecencyWeight} help="Higher means older seasons fade faster in the ratings calculation." />
          <Select label="Overall Talent Weight" value={ratingTalentWeight} options={splitOptions} onChange={setRatingTalentWeight} help="How much total composite rating uses roster talent instead of performance stats." />
          <Select label="Late Season Talent Weight" value={ratingHistoricalPositionWeight} options={splitOptions} onChange={setRatingHistoricalPositionWeight} help="Talent share after enough games have been played. 0.30 means 30% talent and 70% stats." />
          <Select label="Early Season Talent Weight" value={ratingPreseasonPositionWeight} options={splitOptions} onChange={setRatingPreseasonPositionWeight} help="Talent share at the start of a season before stats are trustworthy." />
          <Select label="Talent Ramp Weeks" value={ratingTalentRampWeeks} options={rampWeekOptions} onChange={setRatingTalentRampWeeks} help="How many weeks it takes to move from early talent weight to late-season talent weight." />
        </div>

        <div className="button-row">
          <button disabled={busy} onClick={saveFormula}>Save Active Formula</button>
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
            onClick={() => runUpdate('backtest with active formula', {
              season: runSeason,
              steps: ['backtest'],
              optimizeBacktest: false
            })}
          >
            Run Backtest
          </button>
          <button
            disabled={busy}
            onClick={() => runUpdate('2026 backtest optimizer', {
              season: runSeason,
              steps: ['backtest'],
              optimizeBacktest: true
            })}
          >
            Run Optimizer
          </button>
        </div>
        {status ? <p className="status-line">{status}</p> : null}
      </section>

      <section className="panel formula-panel">
        <h3>Exact Spread Formula</h3>
        <div className="formula-code">
          <p><strong>Pass advantage</strong> = home passing edge adjusted by home pass rate minus away passing edge adjusted by away pass rate.</p>
          <p><strong>Rush advantage</strong> = home rushing edge adjusted by home rush rate minus away rushing edge adjusted by away rush rate.</p>
          <p><strong>Overall advantage</strong> = ((home offense - away defense) - (away offense - home defense)) / 2.</p>
          <p><strong>Composite advantage</strong> = home composite - away composite.</p>
          <p>
            <strong>Weighted rating gap</strong> = passAdv * {percent(normalized.pass)} + rushAdv * {percent(normalized.rush)} + overallAdv * {percent(normalized.overall)} + compositeAdv * {percent(normalized.composite)}.
          </p>
          <p><strong>Raw home margin</strong> = weightedRatingGap * {pointsPerRating.toFixed(1)} + {homeField.toFixed(1)}.</p>
          <p><strong>Final margin</strong> = raw margin * {marginShrink.toFixed(2)}, capped at +/- {maxMargin.toFixed(1)}, rounded to the nearest 0.5.</p>
          <p><strong>Coach offense boost</strong> = (coach offense rating - 5.5) * {coachOffenseBoost.toFixed(2)} and is added to pass/rush offense.</p>
          <p><strong>Coach defense boost</strong> = (coach defense rating - 5.5) * {coachDefenseBoost.toFixed(2)} and is added to pass/rush defense.</p>
          <p><strong>Development boost</strong> = development tier score * {coachDevelopmentBoost.toFixed(2)} and is added to composite only.</p>
          <p><strong>Rating formula</strong> uses weighted seasons where seasonWeight = (1 / {ratingRecencyWeight.toFixed(2)}) ^ (targetSeason - statSeason). Performance is PPA, success rate, and points per drive. Composite raw = performanceScore * {(1 - ratingTalentWeight).toFixed(2)} + talentZ * 10 * {ratingTalentWeight.toFixed(2)}.</p>
          <p><strong>Talent/stat ramp</strong> starts at {percent(ratingPreseasonPositionWeight)} talent and {percent(1 - ratingPreseasonPositionWeight)} stats, then moves toward {percent(ratingHistoricalPositionWeight)} talent and {percent(1 - ratingHistoricalPositionWeight)} stats by week {ratingTalentRampWeeks.toFixed(0)}.</p>
          <p><strong>Coach timing</strong> only applies a coach's boosts in seasons where that coach has already been hired. For example, a 2025 hire does not change 2022, 2023, or 2024 ratings.</p>
        </div>
      </section>
    </div>
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
