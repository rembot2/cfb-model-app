import { runModelUpdate } from '../lib/jobs/run-update';
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

runModelUpdate({
  season,
  includeBacktest: process.argv.includes('--backtest'),
  steps,
  optimizeBacktest
})
  .then(result => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
