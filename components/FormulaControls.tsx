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
};

const weightOptions = range(0, 1, 0.05);
const pointsOptions = range(0.5, 2.5, 0.1);
const homeFieldOptions = range(0, 5, 0.5);
const shrinkOptions = range(0.5, 1, 0.05);
const maxMarginOptions = range(14.5, 45.5, 1);
const coachBoostOptions = range(0, 3, 0.25);
const recencyOptions = range(1, 5, 0.25);
const splitOptions = range(0, 1, 0.05);
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
          ratingPreseasonPositionWeight
        })
      });
      const json = await response.json();
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
      const json = await response.json();
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
          <Select label="Action Season" value={runSeason} options={seasonOptions} onChange={setRunSeason} />
          <Select label="Pass Advantage Weight" value={passWeight} options={weightOptions} onChange={setPassWeight} />
          <Select label="Rush Advantage Weight" value={rushWeight} options={weightOptions} onChange={setRushWeight} />
          <Select label="Overall Advantage Weight" value={overallWeight} options={weightOptions} onChange={setOverallWeight} />
          <Select label="Composite Advantage Weight" value={compositeWeight} options={weightOptions} onChange={setCompositeWeight} />
          <Select label="Points Per Rating" value={pointsPerRating} options={pointsOptions} onChange={setPointsPerRating} />
          <Select label="Home Field" value={homeField} options={homeFieldOptions} onChange={setHomeField} />
          <Select label="Margin Shrink" value={marginShrink} options={shrinkOptions} onChange={setMarginShrink} />
          <Select label="Max Margin" value={maxMargin} options={maxMarginOptions} onChange={setMaxMargin} />
          <Select label="Coach Offense Boost" value={coachOffenseBoost} options={coachBoostOptions} onChange={setCoachOffenseBoost} />
          <Select label="Coach Defense Boost" value={coachDefenseBoost} options={coachBoostOptions} onChange={setCoachDefenseBoost} />
          <Select label="Coach Development Boost" value={coachDevelopmentBoost} options={coachBoostOptions} onChange={setCoachDevelopmentBoost} />
          <Select label="Stats Recency Weight" value={ratingRecencyWeight} options={recencyOptions} onChange={setRatingRecencyWeight} />
          <Select label="Overall Talent Weight" value={ratingTalentWeight} options={splitOptions} onChange={setRatingTalentWeight} />
          <Select label="2022-25 Position Weight" value={ratingHistoricalPositionWeight} options={splitOptions} onChange={setRatingHistoricalPositionWeight} />
          <Select label="2026 Position Weight" value={ratingPreseasonPositionWeight} options={splitOptions} onChange={setRatingPreseasonPositionWeight} />
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
          <p><strong>2022-25 rating formula</strong> uses weighted seasons where seasonWeight = (1 / {ratingRecencyWeight.toFixed(2)}) ^ (targetSeason - statSeason). Performance is PPA, success rate, and points per drive. Composite raw = performanceScore * {(1 - ratingTalentWeight).toFixed(2)} + talentZ * 10 * {ratingTalentWeight.toFixed(2)}.</p>
          <p><strong>Position split</strong> for 2022-25 uses {percent(ratingHistoricalPositionWeight)} position talent and {percent(1 - ratingHistoricalPositionWeight)} on-field performance in pass/rush offense and defense.</p>
          <p><strong>2026 preseason split</strong> uses {percent(ratingPreseasonPositionWeight)} position talent and {percent(1 - ratingPreseasonPositionWeight)} performance, with new coach hire years allowed to increase position reliance.</p>
        </div>
      </section>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={event => onChange(Number(event.target.value))}>
        {options.map(option => (
          <option key={option} value={option}>{option.toFixed(option % 1 ? 2 : 0).replace(/0$/, '')}</option>
        ))}
      </select>
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
