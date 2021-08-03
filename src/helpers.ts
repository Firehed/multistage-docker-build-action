import * as core from '@actions/core'
import { exec } from '@actions/exec'
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


const pullRequestEvents = [
  'pull_request',
  'pull_request_review',
  'pull_request_review_comment',
]
export function getFullCommitHash(): string {
  // Github runs actions triggered by PRs on a merge commit. This populates
  // GITHUB_SHA and related fields with the merge commit hash, rather than the
  // hash of the commit that triggered the PR.
  //
  // For many situations, that results in very confusing mismatches, especially
  // when trying to use commit hashes for build targets

  if (pullRequestEvents.includes(github.context.eventName)) {
    const prEvent = github.context.payload.pull_request as unknown as any
    return prEvent.head.sha
  }
  return github.context.sha
}

export function getBaseStages(): string[] {
  return core.getInput('stages').split(',').map(stage => stage.trim())
}

export function getAllStages(): string[] {
  const stages = [
    ...getBaseStages(),
    core.getInput('server-stage').trim(),
  ]

  const testStage = core.getInput('testenv-stage').trim()
  if (testStage !== '') {
    stages.push(testStage)
  }
  return stages
}

/**
 * Takes the build stage and returns an untagged image name for it
 */
export function getUntaggedImageForStage(stage: string): string {
  const repo = core.getInput('repository')
  return `${repo}/${stage}`
}

export function getTaggedImageForStage(stage: string, tag: string): string {
  const image = getUntaggedImageForStage(stage)
  return `${image}:${tag}`
}

type DockerCommand = 'pull' | 'push' | 'build' | 'tag'

interface ExecResult {
  exitCode: number
}

export async function runDockerCommand(command: DockerCommand, ...args: string[]): Promise<ExecResult> {
  const quiet = core.getBooleanInput('quiet') ? '--quiet' : ''
  const exitCode = await exec('docker', [command, quiet, ...args])

  return {
    exitCode,
  }
}
