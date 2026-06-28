import { dispatchGithubWorkflow } from '@/lib/github/actions';

export const dynamic = 'force-dynamic';

const DEFAULT_WORKFLOW = 'refresh-model.yml';

export async function POST() {
  const workflow = process.env.GITHUB_ACTIONS_REFRESH_WORKFLOW || DEFAULT_WORKFLOW;
  return dispatchGithubWorkflow({ workflow });
}
