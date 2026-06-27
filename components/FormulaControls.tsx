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
};

const weightOptions = range(0, 1, 0.05);
const pointsOptions = range(0.5, 2.5, 0.1);
const homeFieldOptions = range(0, 5, 0.5);
const shrinkOptions = range(0.5, 1, 0.05);
const maxMarginOptions = range(14.5, 45.5, 1);

export function FormulaControls({ activeConfig }: { activeConfig: FormulaConfig | null }) {
  const [secret, setSecret] = useState('');
  const [name, setName] = useState(String(activeConfig?.name ?? 'manual-formula'));
  const [passWeight, setPassWeight] = useState(value(activeConfig?.pass_weight, 0.3));
  const [rushWeight, setRushWeight] = useState(value(activeConfig?.rush_weight, 0.2));
  const [overallWeight, setOverallWeight] = useState(value(activeConfig?.overall_weight, 0.25));
  const [compositeWeight, setCompositeWeight] = useState(value(activeConfig?.composite_weight, 0.25));
  const [pointsPerRating, setPointsPerRating] = useState(value(activeConfig?.points_per_rating, 1.4));
  const [homeField, setHomeField] = useState(value(activeConfig?.home_field, 2.5));
  const [marginShrink, setMarginShrink] = useState(value(activeConfig?.margin_shrink, 0.75));
  const [maxMargin, setMaxMargin] = useState(value(activeConfig?.max_margin, 24.5));
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
    if (!secret.trim()) {
      setStatus('Enter your CRON_SECRET first. It is the same secret you use for the update URL.');
      return;
    }
    setBusy(true);
    setStatus('Saving formula...');
    try {
      const response = await fetch('/api/formula', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${secret.trim()}`
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
          maxMargin
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
    if (!secret.trim()) {
      setStatus('Enter your CRON_SECRET first.');
      return;
    }
    setBusy(true);
    setStatus(`Running ${label}...`);
    try {
      const response = await fetch('/api/jobs/update', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${secret.trim()}`
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
          <label>
            Admin Secret
            <input
              value={secret}
              onChange={event => setSecret(event.target.value)}
              type="password"
              placeholder="CRON_SECRET"
            />
          </label>
          <Select label="Pass Advantage Weight" value={passWeight} options={weightOptions} onChange={setPassWeight} />
          <Select label="Rush Advantage Weight" value={rushWeight} options={weightOptions} onChange={setRushWeight} />
          <Select label="Overall Advantage Weight" value={overallWeight} options={weightOptions} onChange={setOverallWeight} />
          <Select label="Composite Advantage Weight" value={compositeWeight} options={weightOptions} onChange={setCompositeWeight} />
          <Select label="Points Per Rating" value={pointsPerRating} options={pointsOptions} onChange={setPointsPerRating} />
          <Select label="Home Field" value={homeField} options={homeFieldOptions} onChange={setHomeField} />
          <Select label="Margin Shrink" value={marginShrink} options={shrinkOptions} onChange={setMarginShrink} />
          <Select label="Max Margin" value={maxMargin} options={maxMarginOptions} onChange={setMaxMargin} />
        </div>

        <div className="button-row">
          <button disabled={busy} onClick={saveFormula}>Save Active Formula</button>
          <button
            disabled={busy}
            onClick={() => runUpdate('2026 ratings and predictions', {
              season: 2026,
              steps: ['ratings', 'predictions'],
              optimizeBacktest: false
            })}
          >
            Recalc 2026
          </button>
          <button
            disabled={busy}
            onClick={() => runUpdate('2026 backtest optimizer', {
              season: 2026,
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
