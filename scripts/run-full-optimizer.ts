import { runFullOptimizerThroughSeason } from '../lib/jobs/run-update';
import { getServiceSupabase } from '../lib/db/client';

const seasonArg = process.argv.find(arg => arg.startsWith('--season='));
const season = Number(seasonArg?.split('=')[1] ?? process.env.OPTIMIZER_SEASON ?? 2025);

checkOptimizerSchema()
  .then(() => runFullOptimizerThroughSeason(season))
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

async function checkOptimizerSchema() {
  const supabase = getServiceSupabase();
  const requiredOptimizerColumns = [
    'coach_offense_boost',
    'coach_defense_boost',
    'coach_development_boost',
    'rating_talent_ramp_weeks'
  ];
  const requiredConfigColumns = [
    'rating_talent_ramp_weeks'
  ];

  const optimizerCheck = await supabase
    .from('weight_optimizer')
    .select(requiredOptimizerColumns.join(','))
    .limit(1);
  const configCheck = await supabase
    .from('model_configs')
    .select(requiredConfigColumns.join(','))
    .limit(1);

  if (optimizerCheck.error || configCheck.error) {
    throw new Error([
      'Supabase is missing columns needed by the full optimizer.',
      'Open Supabase SQL Editor and run database/migrate-rating-formula-controls.sql from the repo.',
      optimizerCheck.error ? `weight_optimizer check: ${optimizerCheck.error.message}` : '',
      configCheck.error ? `model_configs check: ${configCheck.error.message}` : ''
    ].filter(Boolean).join('\n'));
  }
}
