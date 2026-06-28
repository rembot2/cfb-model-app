import { NextRequest } from 'next/server';
import { dispatchGithubWorkflow } from '@/lib/github/actions';

export const dynamic = 'force-dynamic';

const DEFAULT_WORKFLOW = 'full-optimizer.yml';

export async function POST(request: NextRequest) {
  const workflow = process.env.GITHUB_ACTIONS_OPTIMIZER_WORKFLOW || DEFAULT_WORKFLOW;
  const body = await request.json().catch(() => ({}));
  const season = String(body.season || '2025');

  return dispatchGithubWorkflow({
    workflow,
    inputs: { season }
  });
}
