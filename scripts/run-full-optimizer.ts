import { runFullOptimizerThroughSeason } from '../lib/jobs/run-update';

const seasonArg = process.argv.find(arg => arg.startsWith('--season='));
const season = Number(seasonArg?.split('=')[1] ?? process.env.OPTIMIZER_SEASON ?? 2025);

runFullOptimizerThroughSeason(season)
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
