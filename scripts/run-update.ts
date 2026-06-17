import { runModelUpdate } from '../lib/jobs/run-update';

const seasonArg = process.argv.find(arg => arg.startsWith('--season='));
const season = Number(seasonArg?.split('=')[1] ?? new Date().getFullYear());

runModelUpdate({ season, includeBacktest: process.argv.includes('--backtest') })
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
