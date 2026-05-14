Update the Node.js base image and rebuild:

1. Run `./scripts/update-base-image.sh` to:
   - Fetch the latest UBI10 Node.js 22 image tag from Red Hat registry (using skopeo)
   - Compare with the current tag in `packages/backend/Dockerfile`
   - Update the FROM clause if a newer version is available
   - Build the Docker image using quick mode (skips lint/tests)
2. Report results showing:
   - Whether an update was available
   - Old vs new image tag (if updated)
   - Build status
