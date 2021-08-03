import * as core from '@actions/core'
import * as exec from '@actions/exec'

import {
  isDefaultBranch,
  getFullCommitHash,
  getTagForRun,
  getBaseStages,
  getAllStages,
  getImageForStage,
} from './helpers'

async function run(): Promise<void> {
  try {
    await build()
  } catch (error) {
    core.setFailed(error.message)
  }
}

async function build(): Promise<void> {
  const stages = getBaseStages()
  for (const stage of stages) {
    await buildStage(stage)
  }

  // TODO: refactor these, possibly parallelize
  const testStage = core.getInput('testenv-stage').trim()
  if (testStage === '') {
    core.info('testenv-stage not set; skipping build')
  } else {
    // Tag the branch tag & add the commit tag
    const testTagBranch = await buildStage(testStage)
    const testTag = await tagCommit(testTagBranch)
    await dockerPush(testTag)
    core.setOutput('testenv-tag', testTag)
  }

  // Tag the branch tag & add the commit tag
  const serverStage = core.getInput('server-stage').trim()
  const serverTagBranch = await buildStage(serverStage)
  const serverTag = await tagCommit(serverTagBranch)
  await dockerPush(serverTag)

  if (core.getBooleanInput('tag-latest-on-default') && isDefaultBranch()) {
    core.info('Creating `latest` tag for default branch')
    const latestTag = await tagCommit(serverTagBranch, 'latest')
    await dockerPush(latestTag)
  }


  core.setOutput('commit', getFullCommitHash())
  core.setOutput('server-tag', serverTag)
}

/**
 * Runs docker build commands targeting the specified stage, and returns
 * a tag specific to the ref/branch that the action is run on.
 */
async function buildStage(stage: string): Promise<string> {
  core.info(`Building stage ${stage}`)

  const quiet = core.getInput('quiet') ? '--quiet' : ''

  const name = getImageForStage(stage)
  const tagForRun = getTagForRun()
  const tagsToTry = [tagForRun, 'latest']
  // let cacheImage = ''
  for (const tag of tagsToTry) {
    const image = `${name}:${tag}`
    core.debug(`Pulling ${image}`)
    try {
      await exec.exec('docker', [
        'pull',
        quiet,
        image,
      ])
      // cacheImage = image
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

  const cacheFrom = Array.from(getAllPossibleCacheTargets())
    .flatMap(target => ['--cache-from', target])
  const result = await exec.exec('docker', [
    'build',
    quiet,
    // '--build-arg', 'BUILDKIT_INLINE_CACHE="1"',
    // '--cache-from', cacheImage ? cacheImage : '""',
    ...cacheFrom,
    '--file', dockerfile,
    '--tag', targetTag,
    '--target', stage,
    '.'
  ])
  if (result > 0) {
    throw 'Docker build failed'
  }
  dockerPush(targetTag)
  return targetTag
}

async function dockerPush(taggedImage: string): Promise<void> {
  core.debug(`Pushing ${taggedImage}`)
  const quiet = core.getInput('quiet') ? '--quiet' : ''
  const pushResult = await exec.exec('docker', [
    'push',
    quiet,
    taggedImage,
  ])
  if (pushResult > 0) {
    throw 'Docker push failed'
  }
}

/**
 * Takes a docker image (which may or may not have a tag suffix) and adds or
 * replaces the tag component with the provided tag parameter. If one is not
 * specified, the full git commit hash is used as the tag component.
 *
 * Returns the full target image with tag.
 */
async function tagCommit(maybeTaggedImage: string, tag?: string): Promise<string> {
  if (tag === undefined) {
    tag = getFullCommitHash()
  }
  core.info(`Tag component: ${tag}`)
  // Don't use a simple ":" split since registries can specify port
  const segments = maybeTaggedImage.split('/')
  const lastImageSegment = segments.pop()
  if (lastImageSegment!.includes(':')) {
    const segmentWithoutTag = lastImageSegment!.substring(0, lastImageSegment!.indexOf(':'))
    segments.push(`${segmentWithoutTag}:${tag}`)
  } else {
    segments.push(`${lastImageSegment}:${tag}`)
  }

  const name = segments.join('/')
  await exec.exec('docker', [
    'tag',
    maybeTaggedImage,
    name,
  ])
  return name
}

function getAllPossibleCacheTargets(): Set<string> {
  const tags = [getTagForRun(), 'latest']
  const stages = getAllStages()

  const out = stages.map(getImageForStage)
    .flatMap(image => tags.map(tag => `${image}:${tag}`))

  return new Set(out)
}

run()
