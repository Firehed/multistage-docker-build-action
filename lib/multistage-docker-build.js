"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const exec = __importStar(require("@actions/exec"));
const helpers_1 = require("./helpers");
async function run() {
    try {
        await build();
    }
    catch (error) {
        core.setFailed(error.message);
    }
}
async function build() {
    const stages = core.getInput('stages').split(',').map(stage => stage.trim());
    for (const stage of stages) {
        await buildStage(stage);
    }
    // TODO: refactor these, possibly parallelize
    const testStage = core.getInput('testenv-stage').trim();
    const testTagBranch = await buildStage(testStage);
    const testTag = await tagCommit(testTagBranch);
    await dockerPush(testTag);
    const serverStage = core.getInput('server-stage').trim();
    const serverTagBranch = await buildStage(serverStage);
    const serverTag = await tagCommit(serverTagBranch);
    await dockerPush(serverTag);
    core.setOutput('testenv-tag', testTag);
    core.setOutput('server-tag', serverTag);
}
async function buildStage(stage) {
    core.info(`Building stage ${stage}`);
    const repo = core.getInput('repository');
    const quiet = core.getInput('quiet') ? '--quiet' : '';
    const name = `${repo}/${stage}`;
    const tagForRun = helpers_1.getTagForRun();
    const tagsToTry = [tagForRun, 'latest'];
    for (const tag of tagsToTry) {
        const image = `${name}:${tag}`;
        core.debug(`Pulling ${image}`);
        try {
            await exec.exec('docker', [
                'pull',
                quiet,
                image,
            ]);
            await exec.exec('docker', [
                'tag',
                image,
                stage,
            ]);
            // Don't pull fallback tags if pull succeeds
            break;
        }
        catch (error) {
            // Initial pull failing is OK
            core.info(`Docker pull ${image} failed`);
        }
    }
    const dockerfile = core.getInput('dockerfile');
    core.debug(`Building ${stage}`);
    const targetTag = `${name}:${tagForRun}`;
    const result = await exec.exec('docker', [
        'build',
        // quiet,
        '--build-arg', 'BUILDKIT_INLINE_CACHE="1"',
        '--cache-from', stage,
        '--file', dockerfile,
        '--tag', targetTag,
        '--target', stage,
        '.'
    ]);
    if (result > 0) {
        throw 'Docker build failed';
    }
    dockerPush(targetTag);
    if (helpers_1.isDefaultBranch()) {
        core.info("TODO: docker tag targetTag name:latest");
        core.info("TODO: docker push name:latest");
    }
    return targetTag;
}
async function dockerPush(tag) {
    core.debug(`Pushing ${tag}`);
    const quiet = core.getInput('quiet') ? '--quiet' : '';
    const pushResult = await exec.exec('docker', [
        'push',
        quiet,
        tag,
    ]);
    if (pushResult > 0) {
        throw 'Docker push failed';
    }
}
async function tagCommit(maybeTaggedImage) {
    const hash = helpers_1.getFullCommitHash();
    core.info(`Commit hash: ${hash}`);
    // Don't use a simple ":" split since registries can specify port
    const segments = maybeTaggedImage.split('/');
    const lastImageSegment = segments.pop();
    if (lastImageSegment.includes(':')) {
        const segmentWithoutTag = lastImageSegment.substring(0, lastImageSegment.indexOf(':'));
        segments.push(`${segmentWithoutTag}:${hash}`);
    }
    else {
        segments.push(`${lastImageSegment}:${hash}`);
    }
    const commitTag = segments.join('/');
    await exec.exec('docker', [
        'tag',
        maybeTaggedImage,
        commitTag,
    ]);
    return commitTag;
}
run();
