# Multistage Docker Build Action

This action is designed to perform multistage Docker builds in a straightforward and fast way.
As it turns out, this is surprisingly difficult to do well in CI, since the host machine performing the build typically starts in a clean slate each time, which means most of the layer caching used by Docker becomes moot.
Trying to use Github's `actions/cache` to work around this can be quite challenging, and manually dealing with each stage in the build requires a lot of repetition in the Action YAML.

The inputs to this action allow you to specify the various build stage names as cache targets that will be created and pushed to the registry for future re-use.
Each stage will be tagged using the branch name and full commit hash.
While the initial build will, of course, be performed from scratch, subsequent builds will pull the previously-built images that the layer caching can use.

While the action allows many stages to be pushed to the registry for future re-use, two final stages are defined for different purposes:
* The `testenv-stage` is a stage specially labeled for use in testing your software.  It usually includes all the runtime dependencies for your software and any additional dependencies that may only be required for testing.  
* The `server-stage` is a stage specially labeled for deployment of your software.  It usually includes a fully installed version of your software.  This stage can be used in different ways depending on the purpose of your software.  If your software is a server, then this stage can be the basis for deployment in production.  If your software is for individual users to process data, then this stage can be luanched to use the software.

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `repository` | **yes** | | Repository name for pushed images |
| `stages` | **yes** | | Comma-separarted list of build stages. Each of these will be an explicit cache target for subsequent builds |
| `server-stage` | **yes** | | Name of stage for server |
| `tag-latest-on-default` | no | `true` | Automatically create a `latest` tag when run on the default branch |
| `custom-tag` | no | ` ` | A user-defined tag to apply to successfully built and pushed images |
| `testenv-stage` | no | | Name of stage for test environment |
| `context` | no | `.` | Build context |
| `dockerfile` | no | `Dockerfile` | Path to the Dockerfile |
| `quiet` | no | `true` | Should docker commands be passed `--quiet` |
| `parallel` | no | `false` | Should stages be built in parallel (via BuildX) |
| `build-args` | no | | Comma-separated list of `--build-arg` flags. |

### Parallel builds
The new `parallel` option, added in `v1.7`, defaults to off.
In the next major version (v2), it will default to on.

Changing to the opposite build mode, either implicitly or explicitly, *will break your layer cache for the first build*.
The internal image formats are incompatible, and are tagged accordingly to avoid conflicts.
This is a Docker limitation at this time.
Please note that all images not produced in `outputs` (see below) are considered internal implementation details, subject to change, and **should never be deployed**.

The current parallel build implementation uses `docker buildx` with very specific `--cache-from` flags to encourage layer reuse.
Note that this is considered an internal implementation detail, and is subject to change during a minor and/or point release.
However such a change is unlikely and will be documented.

If you have explicly set `DOCKER_BUILDKIT=1` or `DOCKER_BUILDKIT=0`, it will override the input setting.
Use of this is **not recommended**.

## Outputs

| Output | Description |
|---|---|
| `commit` | The full commit hash used for tags |
| `server-tag` | Commit-specific tag for server |
| `testenv-tag` | Commit-specific tag for test env (`''` if `testenv-stage` is omitted) |

## Example

The following Actions workflow file will:

- Check out the code
- Authenticate to the Docker registry
- Perform the multistage build (pulling previous images as needed)
- Run the test image
- Deploy the server if tests pass

```yaml
on:
  push:
    branches:
      - main
  pull_request:

jobs:
  build-and-test:
    name: Build and test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      # This step MUST be performed before multistage-docker-build
      - name: Auth to GH registry
        uses: docker/login-action@v1
        with:
          registry: ghcr.io
          username: ${{ github.repository_owner }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: firehed/multistage-docker-build-action@v1
        id: build
        with:
          dockerfile: examples/Dockerfile
          repository: ghcr.io/firehed/actions
          stages: env, configured
          testenv-stage: testenv
          server-stage: server
          build-args: arg1=val1, arg2=val2

      # This assumes your testenv actually runs the tests, and
      # exits 0 if they all pass and nonzero on failure
      - name: Run tests
        run: docker run ${{ steps.build.outputs.testenv-tag }}
        
      # This can be any command, and you will probably need to
      # do additional setup first
      - name: Deploy
        run: kubectl set image deploy myapp server=${{ steps.build.outputs.server-tag }}
```

The following images will exist:

- `ghcr.io/firehed/actions/server:{commit-hash}`
- `ghcr.io/firehed/actions/server:latest` (if the action runs on the default branch, e.g. "main" or "master")
- `ghcr.io/firehed/actions/testenv:{commit-hash}` (if `testenv-stage` is provided)

The intended use-case is that the `testenv` will be used for further testing in CI, and the `server` will eventually be deployed.
You may want remove the intermediate branch images when the branch is closed to save on storage.

The following images will also be created, but they are for internal use only (relating to layer caching).
You should not use, deploy, or otherwise depend on them - they may change at any time!

- `ghcr.io/firehed/actions/env:{branch-related-name}`
- `ghcr.io/firehed/actions/configured:{branch-related-name}`

tl:dr: If it comes from one of the `outputs` of this action, go ahead and use it. If not, don't!

## Known issues/Future features

- Make a straightforward mechanism to do cleanup
