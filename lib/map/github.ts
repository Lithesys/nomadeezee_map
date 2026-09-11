import { serverEnv } from "@/lib/env";

type PublishDispatchInput = {
  jobId: string;
  releaseId: string;
  releaseKey: string;
  expectedGeneration: number;
};

export type PublishDispatchResult =
  | { status: "dispatched"; workflow: string; repository: string }
  | { status: "manual"; reason: string };

/**
 * Dispatches the immutable tile build only when the Vercel project has been
 * configured with a GitHub token. Local development remains usable without a
 * token: the queued job can be dispatched from GitHub Actions manually.
 */
export async function dispatchMapPublish(input: PublishDispatchInput): Promise<PublishDispatchResult> {
  const token = serverEnv("GITHUB_TOKEN");
  const repository = serverEnv("GITHUB_REPOSITORY");
  const workflow = serverEnv("GITHUB_PUBLISH_WORKFLOW") ?? "publish-map.yml";
  const ref = serverEnv("GITHUB_PUBLISH_REF") ?? "master";

  if (!token || !repository) {
    return {
      status: "manual",
      reason: "GitHub dispatch is not configured; use the queued job inputs in the GitHub Actions workflow.",
    };
  }

  const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref,
      inputs: {
        job_id: input.jobId,
        release_id: input.releaseId,
        release_key: input.releaseKey,
        expected_generation: String(input.expectedGeneration),
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    // Do not pass GitHub's response body back to the browser: it may contain
    // repository details or provider-specific diagnostics.
    throw new Error(`GitHub workflow dispatch failed with HTTP ${response.status}`);
  }

  return { status: "dispatched", workflow, repository };
}
