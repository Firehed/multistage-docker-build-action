import * as github from '@actions/github'

// Returns a string like "refs_pull_1_merge-bk1"
export function getTagForRun(): string {
  const usingBuildkit = process.env.DOCKER_BUILDKIT === '1'
  const tagFriendlyRef = process.env.GITHUB_REF?.replace(/\//g, '_')

  return `${tagFriendlyRef}-bk${usingBuildkit ? '1' : '0'}`
}

export function isDefaultBranch(): boolean {
  const defaultBranch = github.context.payload.repository?.default_branch
  return github.context.payload.ref === `refs/heads/${defaultBranch}`
}


export function getFullCommitHash(): string {
  // Github runs actions triggered by PRs on a merge commit. This populates
  // GITHUB_SHA and related fields with the merge commit hash, rather than the
  // hash of the commit that triggered the PR.
  //
  // For many situations, that results in very confusing mismatches, especially
  // when trying to use commit hashes for build targets

  if (github.context.eventName !== 'pull_request') {
    return github.context.sha
  }

  const prEvent = github.context.payload.pull_request as unknown as any
  return prEvent.head.sha
}
