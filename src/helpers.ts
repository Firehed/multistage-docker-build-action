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
  return core.getInput('stages')
    .split(',')
    .map(stage => stage.trim())
    .filter(stage => stage !== '')
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
function getUntaggedImageForStage(stage: string): string {
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
  stderr: string
  stdout: string
}

/**
 * Runs a docker command and returns the output. Unlike exec.exec, this does
 * not throw on a nonzero exit code.
 */
export async function runDockerCommand(command: DockerCommand, ...args: string[]): Promise<ExecResult> {
  let rest: string[] = [command]
  if (core.getBooleanInput('quiet') && command !== 'tag') {
    rest.push('--quiet')
  }
  rest.push(...args)

  let stdout = ''
  let stderr = ''

  const execOptions = {
    ignoreReturnCode: true, // Will do manual error handling
    listeners: {
      stderr: (data: Buffer) => {
        stderr += data.toString()
      },
      stdout: (data: Buffer) => {
        stdout += data.toString()
      },
    }
  }
  const exitCode = await exec('docker', rest, execOptions)

  return {
    exitCode,
    stderr,
    stdout,
  }
}


export async function time<T>(name: string, timedFunction: () => Promise<T>): Promise<T> {
  const start = Date.now()
  try {
    return await timedFunction()
  } finally {
    const durationMs = Date.now() - start

    const formattedDuration = formatMs(durationMs)

    core.info(`${name} completed in ${formattedDuration}`)
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) {
    return `${ms / 1000}s`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`
  }

  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}
