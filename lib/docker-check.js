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
const github = __importStar(require("@actions/github"));
const helpers_1 = require("./helpers");
async function run() {
    const checkId = await createCheck();
    try {
        await build();
        updateCheck(checkId, 'success');
    }
    catch (error) {
        updateCheck(checkId, 'failure');
        core.setFailed(error.message);
    }
}
async function createCheck() {
    const token = core.getInput('token');
    const name = core.getInput('name');
    const ok = github.getOctokit(token);
    // https://docs.github.com/en/rest/reference/checks#create-a-check-run
    const createParams = {
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        name,
        head_sha: helpers_1.getFullCommitHash(),
        // started_at = now?
    };
    const check = await ok.rest.checks.create(createParams);
    return check.data.id;
}
async function updateCheck(checkId, conclusion) {
    const token = core.getInput('token');
    const ok = github.getOctokit(token);
    // https://docs.github.com/en/rest/reference/checks#update-a-check-run
    //
    const updateParams = {
        check_run_id: checkId,
        conclusion,
    };
    await ok.rest.checks.update(updateParams);
}
async function build() {
    // Docker run --rm {flags} {image} {command}
    const image = core.getInput('image');
    const command = core.getInput('command');
    // const flags = core.getInput('flags').split(' ').map(flag => flag.trim())
    const flags = core.getInput('flags');
    await exec.exec('docker', [
        'run',
        '--rm',
        flags,
        image,
        command,
    ]);
}
run();
