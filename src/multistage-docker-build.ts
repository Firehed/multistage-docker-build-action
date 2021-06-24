import * as core from '@actions/core'
import * as exec from '@actions/exec'

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
  // stages.forEach(awaitbuildStage)
}

async function buildStage(stage: string): Promise<void> {
  const repo = core.getInput('repository')
  const dockerfile = core.getInput('dockerfile')

  // TODO: :this-branch || :default-branch
  const tag = `${repo}/${stage}`
  core.debug(`Pulling ${tag}`)
  await exec.exec('docker', [
    'pull',
    tag,
  ])
  await exec.exec('docker', [
    'tag',
    tag,
    stage,
  ])
  core.debug(`Building ${tag}`)
  const result = await exec.exec('docker', [
    'build',
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
  core.debug(`Pushing ${tag}`)
  const pushResult = await exec.exec('docker', [
    'push',
    tag,
  ])
  if (pushResult > 0) {
    throw 'Docker push failed'
  }
}

run()
