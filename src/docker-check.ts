import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'

import { getFullCommitHash } from './helpers'

async function run(): Promise<void> {
  const checkId = await createCheck()
  core.debug(`Check ID ${checkId}`)
  try {
    core.debug('before build')
    await build()
    core.debug('after build')
    await updateCheck(checkId, 'success')
    core.debug('after update check success')
  } catch (error) {
    core.debug('error before update')
    // convert to follow up
    await updateCheck(checkId, 'failure')
    core.debug('after update check fail')
    core.setFailed(error.message)
  }
}

async function createCheck(): Promise<number> {
  // https://docs.github.com/en/rest/reference/checks#create-a-check-run
  const token = core.getInput('token')
  const name = core.getInput('name')
  const ok = github.getOctokit(token)

  const createParams = {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    name,
    head_sha: getFullCommitHash(),
  }
  const check = await ok.rest.checks.create(createParams)
  return check.data.id
}

type Conclusion =
  | 'action_required'
  | 'cancelled'
  | 'failure'
  | 'neutral'
  | 'success'
  | 'skipped'
  | 'stale'
  | 'timed_out'

async function updateCheck(checkId: number, conclusion: Conclusion): Promise<void> {
  // https://docs.github.com/en/rest/reference/checks#update-a-check-run
  core.debug(`Updating check ${checkId} to ${conclusion}`)
  const token = core.getInput('token')
  const ok = github.getOctokit(token)
  const updateParams = {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    check_run_id: checkId,
    conclusion,
    status: 'completed',
  }
  await ok.rest.checks.update(updateParams)
}

async function build() {
  // Docker run --rm {flags} {image} {command}
  const image = core.getInput('image')
  const command = core.getInput('command')
  // const flags = core.getInput('flags').split(' ').map(flag => flag.trim())
  const flags = core.getInput('flags')
  await exec.exec(`docker run --rm ${flags} ${image} ${command}`)
}

run()
