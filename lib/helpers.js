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
exports.getFullCommitHash = exports.isDefaultBranch = exports.getTagForRun = void 0;
const github = __importStar(require("@actions/github"));
// Returns a string like "refs_pull_1_merge-bk1"
function getTagForRun() {
    var _a;
    const usingBuildkit = process.env.DOCKER_BUILDKIT === '1';
    const tagFriendlyRef = (_a = process.env.GITHUB_REF) === null || _a === void 0 ? void 0 : _a.replace('/', '_');
    return `${tagFriendlyRef}-bk${usingBuildkit ? '1' : '0'}`;
}
exports.getTagForRun = getTagForRun;
function isDefaultBranch() {
    var _a;
    const defaultBranch = (_a = github.context.payload.repository) === null || _a === void 0 ? void 0 : _a.default_branch;
    return github.context.payload.ref === `refs/heads/${defaultBranch}`;
}
exports.isDefaultBranch = isDefaultBranch;
function getFullCommitHash() {
    // Github runs actions triggered by PRs on a merge commit. This populates
    // GITHUB_SHA and related fields with the merge commit hash, rather than the
    // hash of the commit that triggered the PR.
    //
    // For many situations, that results in very confusing mismatches, especially
    // when trying to use commit hashes for build targets
    if (github.context.eventName !== 'pull_request') {
        return github.context.sha;
    }
    const prEvent = github.context.payload.pull_request;
    return prEvent.head.sha;
}
exports.getFullCommitHash = getFullCommitHash;
