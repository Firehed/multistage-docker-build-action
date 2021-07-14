import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'

import { getFullCommitHash } from './helpers'

async function run(): Promise<void> {
  try {
    const checkId = await createCheck()
    await build()
    updateCheck(checkId)
  } catch (error) {
    core.setFailed(error.message)
  }
}

async function createCheck(): Promise<number> {

  const token = core.getInput('token')
  const name = core.getInput('name')
  const ok = github.getOctokit(token)

  // https://docs.github.com/en/rest/reference/checks#create-a-check-run
  const createParams = {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    name,
    head_sha: getFullCommitHash(),
    // started_at = now?
  }
  const check = await ok.rest.checks.create(createParams)
  return check.data.id
}

async function updateCheck(checkId: number): Promise<void> {
  const token = core.getInput('token')
  const ok = github.getOctokit(token)
  // https://docs.github.com/en/rest/reference/checks#update-a-check-run
  //
  const updateParams = {
    check_run_id: checkId,
    conclusion: 'neutral',
    // conclusion: ". Can be one of action_required, cancelled, failure, neutral, success, skipped, stale, or timed_out."
  }
  await ok.rest.checks.update(updateParams)
}

async function build() {
  // Docker run --rm {flags} {image} {command}
  const image = core.getInput('image')
  const command = core.getInput('command')
  // const flags = core.getInput('flags').split(' ').map(flag => flag.trim())
  const flags = core.getInput('flags')
  await exec.exec('docker', [
    'run',
    '--rm',
    flags,
    image,
    command,
  ])
}

run()
