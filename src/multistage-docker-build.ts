import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'

async function run(): Promise<void> {
  try {
    // core.info(JSON.stringify(process.env))

    await build()
  } catch (error) {
    core.setFailed(error.message)
  }
}


async function build(): Promise<void> {
  const stages = core.getInput('stages').split(',').map(stage => stage.trim())
  for (const stage of stages) {
    await buildStage(stage)
  }

  // TODO: skip these build steps if included in stages
  const testStage = core.getInput('testenv-stage').trim()
  const testTagBranch = await buildStage(testStage)
  const testTag = await tagCommit(testTagBranch)
  await dockerPush(testTag)
  const serverStage = core.getInput('server-stage').trim()
  const serverTagBranch = await buildStage(serverStage)
  const serverTag = await tagCommit(serverTagBranch)
  await dockerPush(serverTag)

  core.setOutput('testenv-tag', testTag)
  core.setOutput('server-tag', serverTag)
}

async function buildStage(stage: string): Promise<string> {
  core.info(`Building stage ${stage}`)
  const repo = core.getInput('repository')
  const dockerfile = core.getInput('dockerfile')
  const quiet = core.getInput('quiet') ? '--quiet' : ''

  // TODO: :this-branch || :default-branch
  const tag = `${repo}/${stage}`
  core.debug(`Pulling ${tag}`)
  try {
    await exec.exec('docker', [
      'pull',
      quiet,
      tag,
    ])
    await exec.exec('docker', [
      'tag',
      tag,
      stage,
    ])
  } catch (error) {
    // Initial pull failing is OK
  }
  core.debug(`Building ${tag}`)
  const result = await exec.exec('docker', [
    'build',
    quiet,
    '--build-arg', 'BUILDKIT_INLINE_CACHE="1"',
    '--cache-from', stage,
    '--file', dockerfile,
    '--tag', tag,
    '--target', stage,
    '.'
  ])
  if (result > 0) {
    throw 'Docker build failed'
  }
  dockerPush(tag)

  return tag
}

async function dockerPush(tag: string): Promise<void> {
  core.debug(`Pushing ${tag}`)
  const quiet = core.getInput('quiet') ? '--quiet' : ''
  const pushResult = await exec.exec('docker', [
    'push',
    quiet,
    tag,
  ])
  if (pushResult > 0) {
    throw 'Docker push failed'
  }
}

async function tagCommit(branchTag: string): Promise<string> {
  const hash = getFullCommitHash()
  core.info(`Commit hash: ${hash}`)
  const commitTag = `${branchTag}:${hash}`
  await exec.exec('docker', [
    'tag',
    branchTag,
    commitTag,
  ])
  return commitTag
}

function getFullCommitHash(): string {
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

  // core.info(JSON.stringify(prEvent))

  return prEvent.head.sha
}


run()
