# syntax=docker/dockerfile:1.7-labs
# DevPortal unified image (POC)
#
# Replaces the previous veecode/devportal-base + veecode/devportal split.
# Builds in a single multi-stage Dockerfile: yarn install + workspace build
# + dynamic-plugin export, then assembles the runtime layer.
#
# Local build (WSL — keep memory bounded):
#   docker build . -t veecode/devportal-platform:local \
#     --memory=4g --memory-swap=6g --build-arg DEVPORTAL_VERSION=poc

# Red Hat publishes UBI on two registries: `registry.redhat.io` (authenticated,
# also serves entitled/paid content) and `registry.access.redhat.com` (anonymous,
# UBI-only mirror). They serve the same UBI image bit-for-bit — same digest, same
# release stream, same `/etc/yum.repos.d/` baked in. We pull from the anonymous
# mirror so the build needs no Red Hat credentials in CI, in forks, or on
# contributor laptops. See `docs/adr/012-anonymous-ubi-mirror.md`.
ARG NODE_BASE=registry.access.redhat.com/ubi10/nodejs-22:10.1-1775712813

# Runtime base: the *minimal* UBI Node.js image. It ships node+npm but NO build
# toolchain (make/gcc/g++ are absent) and uses microdnf instead of dnf. The builder
# above keeps the full image because it compiles; the runtime does not — the only
# native module (better-sqlite3) installs a prebuilt binary at `yarn workspaces focus`
# time, so nothing is compiled in the runtime stage. Pinned by digest for a
# reproducible, multi-arch (amd64/arm64/…) build; this is the
# ubi10/nodejs-22-minimal:10.1 image index as of 2026-05-30.
ARG NODE_BASE_RUNTIME=registry.access.redhat.com/ubi10/nodejs-22-minimal:10.1@sha256:ddd89a0893420dc94698d10325c664eb900c61c4c5eb4e839b93a0cd27f34668

# Pinned versions of CLI binaries shipped in the runtime image.
ARG YQ_VERSION=4.53.2
ARG DECK_VERSION=1.59.1
ARG KUBECTL_VERSION=v1.36.0

# allows setting NPM registry from build arg (for mirrors / offline)
ARG NPM_REGISTRY=https://registry.npmjs.org/

# ============================================================================
# Stage 1 — builder: yarn install + build + dynamic-plugin export
# ============================================================================
FROM ${NODE_BASE} AS builder

USER root

RUN --mount=type=cache,target=/var/cache/dnf,sharing=locked \
    --mount=type=cache,target=/var/lib/dnf,sharing=locked \
    dnf -y upgrade && \
    dnf install -y --setopt=install_weak_deps=False --setopt=keepcache=1 \
      make cmake cpp gcc gcc-c++ skopeo git pkg-config \
      jq wget tar gzip ca-certificates \
      python3.12 python3.12-pip python3.12-devel && \
    alternatives --install /usr/bin/python python /usr/bin/python3.12 1 && \
    alternatives --install /usr/bin/pip pip /usr/bin/pip3.12 1

USER default
WORKDIR /build

ARG NPM_REGISTRY
ENV NPM_REGISTRY=$NPM_REGISTRY \
    NPM_CONFIG_REGISTRY=$NPM_REGISTRY \
    YARN_REGISTRY=$NPM_REGISTRY

RUN npm install -g corepack && corepack enable && corepack prepare yarn@4.12.0 --activate

# Build parallelism and V8 heap are PARAMETERS, not baked-in constants. A raw
# `docker build` defaults to the safe floor (single-threaded) so it cannot OOM
# on a memory-constrained host (e.g. WSL). CI raises TURBO_CONCURRENCY via
# --build-arg to exploit its 16GB runners — see .github/workflows/publish.yml.
#
# Memory math: each `turbo run tsc` task is one node process that can grow to
# NODE_MAX_OLD_SPACE. packages/app's type-check peaks above 4GB (we've observed
# heap OOM / exit 129 at the 4GB default), so the heap default stays 6GB — this
# is a correctness floor for app's type graph, NOT a WSL throttle. Safe
# concurrency therefore tracks the memory budget: floor(mem_budget / ~5GB).
ARG TURBO_CONCURRENCY=1
ARG NODE_MAX_OLD_SPACE=6144
ENV TURBO_CONCURRENCY=${TURBO_CONCURRENCY} \
    NODE_OPTIONS=--max-old-space-size=${NODE_MAX_OLD_SPACE}

# --- Dependency layers first ----------------------------------------------------
# Copy only the manifests + lockfiles, run `yarn install`, THEN copy the source.
# A source-only change then reuses the cached install layers instead of re-resolving
# every dependency (the slow part of the build). `COPY --parents` (dockerfile 1.7-labs
# syntax) preserves the workspace directory tree so each package.json lands where Yarn
# expects it. `.yarnrc.yml` is .dockerignore'd; `yarn config set` regenerates it.

# Root workspace (workspaces: packages/*, plugins/*)
COPY --parents --chown=default:default \
    package.json yarn.lock backstage.json \
    packages/*/package.json plugins/*/package.json \
    /build/
# Yarn cache mount so a partial dependency change doesn't re-download every
# tarball on rebuild (mirrors the runtime stage's `yarn workspaces focus` mount).
# Berry's global cache lives under $HOME (/opt/app-root/src) for the `default`
# (uid 1001, gid 0) user; the mount only speeds rebuilds — a --no-cache build
# is unaffected.
RUN --mount=type=cache,target=/opt/app-root/src/.yarn/berry/cache,sharing=locked,uid=1001,gid=0 \
    --mount=type=cache,target=/opt/app-root/src/.yarn/berry/index,sharing=locked,uid=1001,gid=0 \
    yarn config set npmRegistryServer "$NPM_REGISTRY" && \
    yarn config set nodeLinker node-modules && \
    if [ "$NPM_REGISTRY" != "https://registry.npmjs.org/" ]; then \
      HOST=$(printf '%s\n' "$NPM_REGISTRY" | awk -F[/:] '{print $4}') && \
      yarn config set unsafeHttpWhitelist --json "[\"localhost\",\"$HOST\"]"; \
    fi && \
    cp .yarnrc.yml $HOME/.yarnrc.yml && \
    yarn install --immutable

# --- Source + builds ------------------------------------------------------------
# Now the full tree. node_modules/ (created above) survives — COPY only adds/overwrites,
# and host node_modules is .dockerignore'd so it can't clobber the installed one.
COPY --chown=default:default . /build/

# Root workspace build. `build:backend` is `yarn tsc && yarn workspace backend
# build`, so it already runs the full-repo type-check — no separate `yarn tsc &&`
# prefix needed (that was a redundant second pass).
RUN yarn build:backend

# Pre-fetch the small set of npm-published plugins still baked into the image
# (homepage, global-header, about, about-backend). Everything else loads via
# oci:// references at boot. Output dir is consumed in Stage 2.
RUN /build/docker/download-baked-plugins.sh /build/dynamic-plugins-store

# ============================================================================
# Stage 2 — runtime
# ============================================================================
FROM ${NODE_BASE_RUNTIME}

USER root

ARG YQ_VERSION
ARG DECK_VERSION
ARG KUBECTL_VERSION

# Runtime packages. Minimal base → microdnf, and NO build toolchain / *-devel:
# the only native module (better-sqlite3) installs a prebuilt binary during
# `yarn workspaces focus`, so nothing compiles in this stage. `python`/`python3`
# are symlinked to 3.12 because install-dynamic-plugins.sh calls bare `python`
# and the minimal base ships no `alternatives`. yq is fetched with curl (no wget
# on minimal) and is arch-aware (the old line hardcoded amd64 — wrong on arm64).
RUN ARCH="$(arch | sed -e 's/x86_64/amd64/' -e 's/aarch64/arm64/')" && \
    microdnf install -y --nodocs --setopt=install_weak_deps=0 \
      skopeo git jq tar gzip ca-certificates \
      python3.12 python3.12-pip && \
    microdnf clean all && rm -rf /var/cache/dnf /var/cache/yum /var/cache/libdnf5 && \
    ln -sf /usr/bin/python3.12 /usr/bin/python3 && \
    ln -sf /usr/bin/python3.12 /usr/bin/python && \
    curl -fsSL "https://github.com/mikefarah/yq/releases/download/v${YQ_VERSION}/yq_linux_${ARCH}" \
      -o /usr/local/bin/yq && \
    chmod +x /usr/local/bin/yq

RUN ARCH=$(arch | sed -e 's/x86_64/amd64/' -e 's/aarch64/arm64/') && \
    curl -sL "https://github.com/kong/deck/releases/download/v${DECK_VERSION}/deck_${DECK_VERSION}_linux_${ARCH}.tar.gz" -o /tmp/deck.tar.gz && \
    tar -xf /tmp/deck.tar.gz -C /tmp && \
    mv /tmp/deck /usr/local/bin/ && \
    chmod +x /usr/local/bin/deck && \
    rm /tmp/deck.tar.gz

RUN ARCH=$(arch | sed -e 's/x86_64/amd64/' -e 's/aarch64/arm64/') && \
    curl -sLO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${ARCH}/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/

# Python deps for techdocs (mkdocs)
COPY python /opt/python
RUN --mount=type=cache,target=/root/.cache/pip \
    cd /opt/python/ && \
    python3.12 -m pip install --upgrade pip setuptools pyyaml && \
    python3.12 -m pip install -r requirements.txt --ignore-installed urllib3 && \
    mkdocs --version

USER 1001
WORKDIR /app

ARG NPM_REGISTRY
ENV NPM_REGISTRY=$NPM_REGISTRY \
    NPM_CONFIG_REGISTRY=$NPM_REGISTRY \
    YARN_REGISTRY=$NPM_REGISTRY \
    NODE_ENV=production \
    NODE_OPTIONS="--no-node-snapshot"

RUN npm install -g corepack && corepack enable && corepack prepare yarn@4.12.0 --activate

# Skeleton install (dependency manifests only, then production install).
# The skeleton/bundle tarballs are bind-mounted from the builder and extracted in
# place — they never land in their own COPY layer (a `COPY … && rm` leaves the
# tarball stuck in the COPY layer; the later `rm` can't reclaim it).
COPY --chown=1001:0 --from=builder /build/.yarn ./.yarn
COPY --chown=1001:0 --from=builder /build/yarn.lock /build/package.json /build/backstage.json ./
RUN --mount=type=bind,from=builder,source=/build/packages/backend/dist/skeleton.tar.gz,target=/tmp/skeleton.tar.gz \
    tar xzf /tmp/skeleton.tar.gz

RUN yarn config set npmRegistryServer "$NPM_REGISTRY" && \
    yarn config set nodeLinker node-modules && \
    if [ "$NPM_REGISTRY" != "https://registry.npmjs.org/" ]; then \
      HOST=$(printf '%s\n' "$NPM_REGISTRY" | awk -F[/:] '{print $4}') && \
      yarn config set unsafeHttpWhitelist --json "[\"localhost\",\"$HOST\"]"; \
    fi && \
    cp .yarnrc.yml $HOME/.yarnrc.yml

RUN --mount=type=cache,target=/opt/app-root/src/.yarn/berry/cache,sharing=locked,uid=1001,gid=0 \
    --mount=type=cache,target=/opt/app-root/src/.yarn/berry/index,sharing=locked,uid=1001,gid=0 \
    yarn workspaces focus --all --production

# Backend bundle + runtime configs
RUN --mount=type=bind,from=builder,source=/build/packages/backend/dist/bundle.tar.gz,target=/tmp/bundle.tar.gz \
    tar xzf /tmp/bundle.tar.gz

COPY --chown=1001:0 --from=builder /build/examples ./examples
COPY --chown=1001:0 --from=builder /build/rbac-policy.csv ./
COPY --chown=1001:0 --from=builder /build/rbac-policy-extensions.csv /tmp/rbac-policy-extensions.csv
RUN cat /tmp/rbac-policy-extensions.csv >> /app/rbac-policy.csv && rm /tmp/rbac-policy-extensions.csv

COPY --chown=1001:0 --from=builder /build/app-config.yaml /build/app-config.production.yaml /build/app-config.distro.yaml ./

# Bake the small set of npm-published plugins fetched in Stage 1 into the
# image at the path install-dynamic-plugins.py expects (preInstalled:true
# entries in dynamic-plugins.default.yaml). Everything else loads via OCI
# references at boot.
COPY --chown=1001:0 --from=builder /build/dynamic-plugins-store /app/dynamic-plugins-root

# Defensive: install-dynamic-plugins.py writes into this dir at boot, so it
# must exist even if the baked set above is ever emptied. /app/data holds the
# persistent sqlite database (app-config.production.yaml). Both are created
# here as the `default` user, so a freshly-created named volume mounted over
# either path inherits writable ownership.
RUN mkdir -p /app/dynamic-plugins-root /app/data

# Declare /app/data as a volume so `docker run` without an explicit -v still
# gets an anonymous volume mounted here. Marketplace state (extensions-install.yaml,
# write-through cache of the per-plugin SQLite DBs) then survives a `docker stop/
# start` cycle without operator action. For persistence across container recreation
# operators still need a named volume (or use the shipped docker-compose.yml).
VOLUME /app/data

# Pull the marketplace's catalog-backend-module-extensions from the RHDH extensions OCI.
# That module registers the extensions.backstage.io/v1alpha1 Plugin/Package/Collection
# entity kinds and ingests the plugin-catalog-index (the ~215 YAMLs entrypoint.sh downloads
# into /app/catalog-entities/extensions/) into the catalog, which the marketplace queries.
# Without it the marketplace "Catalog" tab is empty.
#
# bs_1.50.0 of quay.io/veecode/extensions is NOT published yet (export-overlays only has
# bs_1.48.4 / bs_1.49.4). The bs_1.49.4 build of catalog-backend-module-extensions imports
# `catalogProcessingExtensionPoint` from `@backstage/plugin-catalog-node/alpha`, which
# Backstage 1.50 graduated to the main `@backstage/plugin-catalog-node` export — so on a
# 1.50 backend that alpha import is `undefined`, the module's `deps.catalog` is `undefined`,
# and the catalog plugin's init crashes ("Cannot read properties of undefined (reading
# 'id')" in BackendInitializer) → the whole backend never reaches "started" → 503 everywhere.
#
# STOPGAP (verified at runtime): pull bs_1.49.4, copy ONLY catalog-backend-module-extensions
# (the RHDH extensions frontend is disabled in dynamic-plugins.default.yaml — VeeCode's
# devportal-marketplace-frontend replaces it — so we don't copy it), and patch its built
# module.cjs.js to fall back to the main `@backstage/plugin-catalog-node` export when
# `/alpha` lacks `catalogProcessingExtensionPoint`. That single change is all the bs_1.49.4
# module needs on Backstage 1.50 — verified: catalog plugin starts clean, the module ingests
# ~85 Plugin + ~120 Package entities, the marketplace "Catalog" tab populates.
#
# TODO: once devportal-plugin-export-overlays publishes a 1.50-built
# quay.io/veecode/extensions:bs_1.50.0 (overlay = change that `/alpha` import to the main
# `@backstage/plugin-catalog-node` export in
# workspaces/extensions/.../catalog-backend-module-extensions/src/module.ts; bump
# versions.json to Backstage 1.50.0), set EXTENSIONS_TAG=bs_1.50.0, copy both plugins, and
# drop the sed patch (it self-skips if the `/alpha` import is absent). See the migration
# follow-up task.
ARG EXTENSIONS_TAG=bs_1.49.4
RUN set -e; \
    OCI_IMAGE="docker://quay.io/veecode/extensions:$EXTENSIONS_TAG"; \
    TMP_OCI="$(mktemp -d)"; \
    TMP_EXTRACT="$(mktemp -d)"; \
    if skopeo copy "$OCI_IMAGE" "dir:$TMP_OCI" 2>/dev/null; then \
      LAYER=$(jq -r '.layers[0].digest' "$TMP_OCI/manifest.json" | sed 's/sha256://'); \
      tar -xzf "$TMP_OCI/$LAYER" -C "$TMP_EXTRACT"; \
      cp -a "$TMP_EXTRACT/red-hat-developer-hub-backstage-plugin-catalog-backend-module-extensions" /app/dynamic-plugins-root/; \
      MOD=/app/dynamic-plugins-root/red-hat-developer-hub-backstage-plugin-catalog-backend-module-extensions/dist/module.cjs.js; \
      if grep -q "plugin-catalog-node/alpha" "$MOD"; then \
        sed -i "s|var alpha = require('@backstage/plugin-catalog-node/alpha');|var alpha = require('@backstage/plugin-catalog-node/alpha'); if (!alpha.catalogProcessingExtensionPoint) alpha = Object.assign({}, alpha, require('@backstage/plugin-catalog-node'));|" "$MOD"; \
        grep -q "Object.assign" "$MOD" || { echo "ERROR: catalogProcessingExtensionPoint /alpha->main patch did not apply to $MOD"; exit 1; }; \
        echo "patched catalog-backend-module-extensions (/alpha -> main catalogProcessingExtensionPoint fallback)"; \
      fi; \
    else \
      echo "WARN: failed to fetch RHDH extensions OCI image $OCI_IMAGE — skipping"; \
    fi; \
    rm -rf "$TMP_OCI" "$TMP_EXTRACT"

# Plugin install scripts + config files consumed at startup
COPY --chown=1001:0 --from=builder /build/dynamic-plugins.yaml /app/
COPY --chown=1001:0 --from=builder /build/dynamic-plugins.default.yaml /app/
COPY --chown=1001:0 --from=builder /build/presets /app/presets
COPY --chown=1001:0 --from=builder /build/docker/install-dynamic-plugins.py /app/install-dynamic-plugins.py
COPY --chown=1001:0 --chmod=755 --from=builder /build/docker/install-dynamic-plugins.sh /app/install-dynamic-plugins.sh

# Marketplace catalog entities — bake a snapshot from the OCI catalog index so
# every fresh container starts ready (~157KB tarball, ~220 YAMLs as of bs_1.49.4).
# The entrypoint's PACKAGES_COUNT guard skips the runtime download when these
# are present. Operators force a runtime refresh with CATALOG_INDEX_REFRESH=true,
# which overlays a fresh download on top of the baked snapshot.
ARG CATALOG_INDEX_IMAGE=quay.io/veecode/plugin-catalog-index:latest
RUN set -e; \
    mkdir -p /app/catalog-entities/extensions/plugins \
             /app/catalog-entities/extensions/packages \
             /app/catalog-entities/extensions/collections; \
    TMP_CATALOG="$(mktemp -d)"; \
    skopeo copy "docker://${CATALOG_INDEX_IMAGE}" "dir:$TMP_CATALOG"; \
    LAYER=$(jq -r '.layers[0].digest' "$TMP_CATALOG/manifest.json" | sed 's/sha256://'); \
    tar -xf "$TMP_CATALOG/$LAYER" -C /app/catalog-entities/extensions --strip-components=1 2>/dev/null \
      || tar -xzf "$TMP_CATALOG/$LAYER" -C /app/catalog-entities/extensions --strip-components=1; \
    YAML_COUNT=$(find /app/catalog-entities/extensions -name '*.yaml' | wc -l); \
    echo "Baked catalog index: $YAML_COUNT YAMLs from $CATALOG_INDEX_IMAGE"; \
    rm -rf "$TMP_CATALOG"

# Version stamp consumed by the about plugin
ARG DEVPORTAL_VERSION=dev
RUN echo "{\"version\":\"${DEVPORTAL_VERSION}\"}" > /app/devportal.json

# Entrypoint
COPY --chown=1001:0 --chmod=755 --from=builder /build/entrypoint.sh /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "packages/backend", "--config", "app-config.yaml", "--config", "app-config.production.yaml", "--config", "/app/dynamic-plugins-root/app-config.dynamic-plugins.yaml"]
