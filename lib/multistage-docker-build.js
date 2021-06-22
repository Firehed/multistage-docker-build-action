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
async function run() {
    try {
        core.info(JSON.stringify(process.env));
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
    // stages.forEach(awaitbuildStage)
}
async function buildStage(stage) {
    const repo = core.getInput('repository');
    const dockerfile = core.getInput('dockerfile');
    // TODO: :this-branch || :default-branch
    const tag = `${repo}/${stage}`;
    core.debug(`Pulling ${tag}`);
    await exec.exec('docker', [
        'pull',
        tag,
    ]);
    await exec.exec('docker', [
        'tag',
        tag,
        stage,
    ]);
    core.debug(`Building ${tag}`);
    const result = await exec.exec('docker', [
        'build',
        '--build-arg', 'BUILDKIT_INLINE_CACHE="1"',
        '--cache-from', stage,
        '--file', dockerfile,
        '--tag', tag,
        '--target', stage,
        '.'
    ]);
    if (result > 0) {
        throw 'Docker build failed';
    }
    core.debug(`Pushing ${tag}`);
    const pushResult = await exec.exec('docker', [
        'push',
        tag,
    ]);
    if (pushResult > 0) {
        throw 'Docker push failed';
    }
}
run();
