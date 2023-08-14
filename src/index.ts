import * as core from '@actions/core'

import {
  isDefaultBranch,
  getFullCommitHash,
  getTagForRun,
  getBuildArgs,
  getBaseStages,
  getAllStages,
  getTaggedImageForStage,
  runDockerCommand,
  shouldBuildInParallel,
  time,
} from './helpers'

async function run(): Promise<void> {
  try {
    await time('Pull images', () =>
      core.group('Pull images for layer cache', pull)
    )
    await time('Full Build', build)
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else if (typeof error === 'string') {
      core.setFailed(error)
    } else {
      core.setFailed('Unknown error! type: ' + typeof error)
    }
  }
}

/**
 * Pre-pull all of the images ahead of the build process so they can be used
 * for layer caching. Tries multiple tags per stage, preferring this branch/ref
 * when available.
 */
async function pull(): Promise<void> {
  const tagsToTry = [getTagForRun(), 'latest']

  for (const stage of getAllStages()) {
    for (const tag of tagsToTry) {
      const taggedName = getTaggedImageForStage(stage, tag)
      const ret = await runDockerCommand('pull', taggedName)
      if (ret.exitCode === 0) {
        // Do not try other tags for this stage
        break
      }
      // keep trying other tags for this stage
    }
  }
}

/**
 * Builds to all of the stages specified by the action's inputs, using the
 * previously-pulled images for layer caching.
 */
async function build(): Promise<void> {
  // Build all of the base stages
  const stages = getBaseStages()
  if (stages.length === 0) {
    core.warning("No base stages included - build process will have limited caching")
  }
  for (const stage of stages) {
    // Always keep intermediate stages up to date on `latest`; this allows new
    // branches to have a reasonable chance at a cache hit
    await buildStage(stage, isDefaultBranch() ? ['latest'] : [])
  }

  const hash = getFullCommitHash()
  const extraTags = [hash]
  if (isDefaultBranch() && core.getBooleanInput('tag-latest-on-default')) {
    extraTags.push('latest')
  }
  
  const customTag = core.getInput('custom-tag')
  if (customTag !== '') {
    extraTags.push(customTag)
  }

  // Build test env if the stage is specified
  const testStage = core.getInput('testenv-stage').trim()
  if (testStage === '') {
    core.info('testenv-stage not set; skipping build')
  } else {
    await buildStage(testStage, extraTags)
    core.setOutput('testenv-tag', getTaggedImageForStage(testStage, hash))
  }

  // Build the server env
  const serverStage = core.getInput('server-stage').trim()
  await buildStage(serverStage, extraTags)
  core.setOutput('server-tag', getTaggedImageForStage(serverStage, hash))

  core.setOutput('commit', hash)
}

/**
 * Runs docker build commands targeting the specified stage, and returns
 * a tag specific to the ref/branch that the action is run on.
 */
async function buildStage(stage: string, extraTags: string[]): Promise<string> {
  return time(`Build ${stage}`, async () => {
    core.startGroup(`Building stage: ${stage}`)

    const useBuildx = shouldBuildInParallel()

    const dockerfile = core.getInput('dockerfile')
    const dockerfileArg = (dockerfile === '') ? [] : ['--file', dockerfile]

    const targetTag = getTaggedImageForStage(stage, getTagForRun())

    const cacheFromArg = getAllPossibleCacheTargets()
      .flatMap(target => ['--cache-from', useBuildx
        ? `type=registry,ref=${target}`
        : target
      ])

    const buildArgs = getBuildArgs()
      .flatMap(arg => ['--build-arg', arg])
    if (useBuildx) {
      buildArgs.push('--build-arg', 'BUILDKIT_INLINE_CACHE=1')
    }

    const result = await runDockerCommand(
      'build',
      ...buildArgs,
      ...cacheFromArg,
      ...dockerfileArg,
      '--tag', targetTag,
      '--target', stage,
      core.getInput('context'),
    )
    if (result.exitCode > 0) {
      throw new Error('Docker build failed')
    }
    await dockerPush(targetTag)

    for (const extraTag of extraTags) {
      await addTagAndPush(targetTag, stage, extraTag)
    }
    core.endGroup()
    return targetTag
  })
}

async function dockerPush(taggedImage: string): Promise<void> {
  core.debug(`Pushing ${taggedImage}`)
  const pushResult = await runDockerCommand(
    'push',
    taggedImage,
  )
  if (pushResult.exitCode > 0) {
    throw new Error('Docker push failed')
  }
}

/**
 * Returns the created tagged image name
 */
async function addTagAndPush(image: string, stage: string, tag: string): Promise<string> {
  const name = getTaggedImageForStage(stage, tag)
  const tagResult = await runDockerCommand('tag', image, name)
  if (tagResult.exitCode > 0) {
    throw new Error('Docker tag failed')
  }
  await dockerPush(name)
  return name
}

function getAllPossibleCacheTargets(): string[] {
  const tags = [getTagForRun(), 'latest']
  const stages = getAllStages()

  return stages.flatMap((stage) => tags.map((tag) => getTaggedImageForStage(stage, tag)))
}

run() // eslint-disable-line
