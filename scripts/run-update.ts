import { runModelUpdate } from '../lib/jobs/run-update';
import { getServiceSupabase } from '../lib/db/client';
import type { UpdateStep } from '../lib/jobs/run-update';

const seasonArg = process.argv.find(arg => arg.startsWith('--season='));
const season = Number(seasonArg?.split('=')[1] ?? new Date().getFullYear());
const stepsArg = process.argv.find(arg => arg.startsWith('--steps='));
const steps = stepsArg
  ? stepsArg.split('=')[1].split(',').map(step => step.trim()).filter(Boolean) as UpdateStep[]
  : undefined;
const optimizeArg = process.argv.find(arg => arg.startsWith('--optimizeBacktest='));
const optimizeBacktest = optimizeArg
  ? optimizeArg.split('=')[1] !== 'false'
  : !process.argv.includes('--no-optimize-backtest');

checkBacktestSchema(steps)
  .then(() => runModelUpdate({
    season,
    includeBacktest: process.argv.includes('--backtest'),
    steps,
    optimizeBacktest
  }))
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

async function checkBacktestSchema(steps: UpdateStep[] | undefined) {
  if (!steps?.some(step => step === 'games' || step === 'stats' || step === 'backtest')) return;

  const supabase = getServiceSupabase();
  const checks = await Promise.all([
    supabase.from('games').select('model_week').limit(1),
    supabase.from('team_game_stats').select('model_week,season_type').limit(1),
    supabase.from('backtest_games').select('week_label').limit(1)
  ]);
  const failed = checks.map(result => result.error?.message).filter(Boolean);
  if (!failed.length) return;

  throw new Error([
    'Supabase is missing columns needed by the backtest week-leakage fix.',
    'Open Supabase SQL Editor and run database/migrate-backtest-model-week.sql from the repo.',
    ...failed.map(message => `- ${message}`)
  ].join('\n'));
}
