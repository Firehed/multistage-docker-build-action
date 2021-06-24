import * as core from '@actions/core'
import * as exec from '@actions/exec'

import {
  isDefaultBranch,
  getFullCommitHash,
  getTagForRun,
} from './helpers'

async function run(): Promise<void> {
  try {
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

  // TODO: refactor these, possibly parallelize
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
  await exec.exec('docker', ['images'])

  const repo = core.getInput('repository')


  const quiet = core.getInput('quiet') ? '--quiet' : ''

  const name = `${repo}/${stage}`
  const tagForRun = getTagForRun()
  const tagsToTry = [tagForRun, 'latest']
  for (const tag of tagsToTry) {
    const image = `${name}:${tag}`
    core.debug(`Pulling ${image}`)
    try {
      await exec.exec('docker', [
        'pull',
        quiet,
        image,
      ])
      await exec.exec('docker', [
        'tag',
        image,
        stage,
      ])
      // Don't pull fallback tags if pull succeeds
      break
    } catch (error) {
      // Initial pull failing is OK
      core.info(`Docker pull ${image} failed`)
    }
  }

  const dockerfile = core.getInput('dockerfile')

  core.debug(`Building ${stage}`)

  const targetTag = `${name}:${tagForRun}`

  const result = await exec.exec('docker', [
    'build',
    // quiet,
    '--build-arg', 'BUILDKIT_INLINE_CACHE="1"',
    '--cache-from', stage,
    '--file', dockerfile,
    '--tag', targetTag,
    '--target', stage,
    '.'
  ])
  if (result > 0) {
    throw 'Docker build failed'
  }
  dockerPush(targetTag)
  if (isDefaultBranch()) {
    core.info("TODO: docker tag targetTag name:latest")
    core.info("TODO: docker push name:latest")
  }

  await exec.exec('docker', ['images'])
  return targetTag
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

async function tagCommit(maybeTaggedImage: string): Promise<string> {
  const hash = getFullCommitHash()
  core.info(`Commit hash: ${hash}`)
  // Don't use a simple ":" split since registries can specify port
  const segments = maybeTaggedImage.split('/')
  const lastImageSegment = segments.pop()
  if (lastImageSegment!.includes(':')) {
    const segmentWithoutTag = lastImageSegment!.substring(0, lastImageSegment!.indexOf(':'))
    segments.push(`${segmentWithoutTag}:${hash}`)
  } else {
    segments.push(`${lastImageSegment}:${hash}`)
  }

  const commitTag = segments.join('/')
  await exec.exec('docker', [
    'tag',
    maybeTaggedImage,
    commitTag,
  ])
  return commitTag
}

run()
