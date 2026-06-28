import { dispatchGithubWorkflow } from '@/lib/github/actions';

export const dynamic = 'force-dynamic';

export async function POST() {
  return dispatchGithubWorkflow({
    workflow: process.env.GITHUB_ACTIONS_BACKTEST_WORKFLOW || 'rebuild-backtests.yml'
  });
}
