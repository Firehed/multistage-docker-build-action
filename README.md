# Multistage Docker Build Action

This action is designed to perform multistage Docker builds in a straightforward and fast way.
As it turns out, this is surprisingly difficult to do well in CI, since the host machine performing the build typically starts in a clean slate each time, which means most of the layer caching used by Docker becomes moot.
Trying to use Github's `actions/cache` to work around this can be quite challenging, and manually dealing with each stage in the build requires a lot of repetition in the Action YAML.

The inputs to this action allow you to specify the various build stage names as cache targets that will be created and pushed to the registry for future re-use.
Each stage will be tagged using the branch name and full commit hash.
While the initial build will, of course, be performed from scratch, subsequent builds will pull the previously-built images that the layer caching can use.


## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `repository` | **yes** | | Repository name for pushed images
| `stages` | **yes** | | Comma-separarted list of build stages |
| `testenv-stage` | **yes** | | Name of stage for test environment |
| `server-stage` | **yes** | | Name of stage for server |
| `dockerfile` | no | `Dockerfile` | Path to the Dockerfile |
| `quiet` | no | `true` | Should docker commands be passed `--quiet` |

## Outputs

| Output | Description |
|---|---|
| `commit` | The full commit hash used for tags |
| `server-tag` | Commit-specific tag for server |
| `testenv-tag` | Commit-specific tag for test env |

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
- `ghcr.io/firehed/actions/testenv:{commit-hash}`
- `ghcr.io/firehed/actions/env:{branch-related-name}`
- `ghcr.io/firehed/actions/configured:{branch-related-name}`

The intended use-case is that the `testenv` will be used for further testing in CI, and the `server` will eventually be deployed. You may want remove the intermediate branch images when the branch is closed to save on storage.

## Known issues/Future features

- Use with Docker Buildkit (via `DOCKER_BUILDKIT=1`) does not consistently use the layer caches.
  This seems to be a Buildkit issue.
  It's recommended to leave Buildkit disabled at this time.
- `latest` tags should be created automatically when on the repository's default branch
- Make a straightforward mechanism to do cleanup
