Release a new version and monitor the Docker Hub image publication:

## Steps

1. **Pre-flight checks**:

   - Run `git status` to ensure working tree is clean
   - Run `git branch --show-current` to confirm on `main` branch
   - If not clean or not on main, abort with explanation

2. **Run the release**:

   - Execute `make release`
   - This will: generate release notes, bump version, commit, push, and create a git tag
   - Extract the new version from package.json after the release

3. **Find the triggered workflow**:

   - Use `gh run list --workflow=publish.yml --limit=5` to find the workflow run triggered by the new tag
   - Get the run ID for the most recent run matching the new version tag

4. **Monitor the workflow**:

   - Poll `gh run view <run-id>` every 30 seconds
   - The workflow has 3 jobs: `validate-tag`, `build` (amd64 + arm64), `manifest`
   - Continue polling until the workflow reaches a terminal state (completed, failed, cancelled)
   - Show progress updates as jobs complete

5. **Report results**:
   - If successful:
     - Confirm the images were pushed: `veecode/devportal-base:<version>`, `veecode/devportal-base:latest`
     - Show the workflow URL for reference
   - If failed:
     - Identify which job failed using `gh run view <run-id> --log-failed`
     - Provide diagnosis based on common failure patterns:
       - `validate-tag`: Tag doesn't match package.json version, or tag commit not on main
       - `build`: Yarn install/build failures, Docker build issues, registry auth problems
       - `manifest`: Docker Hub auth or imagetools issues
     - Show relevant error logs
     - Do NOT attempt to fix - just diagnose and report

## Failure Diagnosis Guide

| Failed Job   | Common Causes                                                                               |
| ------------ | ------------------------------------------------------------------------------------------- |
| validate-tag | Version mismatch between tag and package.json; tag not reachable from main                  |
| build        | TypeScript errors; test failures; lint errors; Docker build failures; Red Hat registry auth |
| manifest     | Docker Hub authentication; missing arch images from build step                              |

## Notes

- The `build-backend-image` workflow is triggered by tags matching `*.*.*`
- Build runs on both `ubuntu-latest` (amd64) and `ubuntu-22.04-arm` (arm64)
- Final images: `docker.io/veecode/devportal-base:<version>` and `:latest`
