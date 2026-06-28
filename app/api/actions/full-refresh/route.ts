import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_REPO = 'rembot2/cfb-model-app';
const DEFAULT_WORKFLOW = 'refresh-model.yml';

export async function POST() {
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  const repo = process.env.GITHUB_ACTIONS_REPO || DEFAULT_REPO;
  const workflow = process.env.GITHUB_ACTIONS_REFRESH_WORKFLOW || DEFAULT_WORKFLOW;
  const ref = process.env.GITHUB_ACTIONS_REF || 'main';

  if (!token) {
    return NextResponse.json({
      ok: false,
      error: 'Missing GITHUB_ACTIONS_TOKEN in Vercel environment variables.'
    }, { status: 500 });
  }

  const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28'
    },
    body: JSON.stringify({ ref })
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json({
      ok: false,
      error: `GitHub workflow dispatch failed: ${response.status} ${text}`
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: `Started ${workflow} on ${repo}@${ref}.`
  });
}
