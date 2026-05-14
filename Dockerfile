# syntax=docker/dockerfile:1.7-labs
# DevPortal unified image (POC)
#
# Replaces the previous veecode/devportal-base + veecode/devportal split.
# Builds in a single multi-stage Dockerfile: yarn install + workspace build
# + dynamic-plugin export, then assembles the runtime layer.
#
# Local build (WSL — keep memory bounded):
#   docker build . -t veecode/devportal:poc \
#     --memory=4g --memory-swap=6g --build-arg DEVPORTAL_VERSION=poc

ARG NODE_BASE=registry.redhat.io/ubi10/nodejs-22:10.1-1775712813

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

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    dnf -y upgrade && \
    dnf install -y --setopt=install_weak_deps=False \
      make cmake cpp gcc gcc-c++ skopeo git pkg-config \
      jq wget tar gzip ca-certificates sqlite-devel \
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

# Conservative parallelism — WSL hosts crash above this.
ENV TURBO_CONCURRENCY=1

# V8 heap headroom for the frontend build (webpack + tsc).
# Default ~4GB is not enough for `packages/app` on WSL; we've observed
# JavaScript heap OOM (exit 129) at the default. 6GB clears it.
ENV NODE_OPTIONS=--max-old-space-size=6144

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
RUN yarn config set npmRegistryServer "$NPM_REGISTRY" && \
    yarn config set nodeLinker node-modules && \
    if [ "$NPM_REGISTRY" != "https://registry.npmjs.org/" ]; then \
      HOST=$(printf '%s\n' "$NPM_REGISTRY" | awk -F[/:] '{print $4}') && \
      yarn config set unsafeHttpWhitelist --json "[\"localhost\",\"$HOST\"]"; \
    fi && \
    cp .yarnrc.yml $HOME/.yarnrc.yml && \
    yarn install --immutable

# Dynamic-plugins workspace — a separate Yarn project, own yarn.lock
# (workspaces: _utils, downloads, packages/*, wrappers/*). Inherits the registry +
# nodeLinker config via $HOME/.yarnrc.yml set above.
COPY --parents --chown=default:default \
    dynamic-plugins/package.json dynamic-plugins/yarn.lock dynamic-plugins/backstage.json \
    dynamic-plugins/_utils/package.json dynamic-plugins/downloads/package.json \
    dynamic-plugins/packages/*/package.json dynamic-plugins/wrappers/*/package.json \
    /build/
RUN cd dynamic-plugins && yarn install --immutable

# --- Source + builds ------------------------------------------------------------
# Now the full tree. node_modules/ (created above) survives — COPY only adds/overwrites,
# and host node_modules is .dockerignore'd so it can't clobber the installed one.
COPY --chown=default:default . /build/

# Root workspace build
RUN yarn tsc && yarn build:backend

# Dynamic-plugins workspace — wrappers + proprietary packages exported as
# Module Federation bundles consumable by the runtime install script.
RUN cd dynamic-plugins && \
    yarn build && \
    yarn export-dynamic && \
    mkdir -p /build/dynamic-plugins-store && \
    yarn copy-dynamic-plugins /build/dynamic-plugins-store

# ============================================================================
# Stage 2 — runtime
# ============================================================================
FROM ${NODE_BASE}

USER root

ARG YQ_VERSION
ARG DECK_VERSION
ARG KUBECTL_VERSION

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    dnf -y upgrade && \
    dnf install -y --setopt=install_weak_deps=False \
      skopeo git jq wget tar gzip ca-certificates sqlite-devel \
      python3.12 python3.12-pip python3.12-devel && \
    alternatives --install /usr/bin/python python /usr/bin/python3.12 1 && \
    alternatives --install /usr/bin/pip pip /usr/bin/pip3.12 1 && \
    wget -q "https://github.com/mikefarah/yq/releases/download/v${YQ_VERSION}/yq_linux_amd64" \
      -O /usr/local/bin/yq && \
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
    pip install --upgrade pip setuptools pyyaml && \
    pip install -r requirements.txt --ignore-installed urllib3 && \
    mkdocs --version

USER default
WORKDIR /app

ARG NPM_REGISTRY
ENV NPM_REGISTRY=$NPM_REGISTRY \
    NPM_CONFIG_REGISTRY=$NPM_REGISTRY \
    YARN_REGISTRY=$NPM_REGISTRY \
    NODE_ENV=production \
    NODE_OPTIONS="--no-node-snapshot"

RUN npm install -g corepack && corepack enable && corepack prepare yarn@4.12.0 --activate

# Skeleton install (dependency manifests only, then production install)
COPY --chown=default:default --from=builder /build/.yarn ./.yarn
COPY --chown=default:default --from=builder /build/yarn.lock /build/package.json /build/backstage.json ./
COPY --chown=default:default --from=builder /build/packages/backend/dist/skeleton.tar.gz ./
RUN tar xzf skeleton.tar.gz && rm skeleton.tar.gz

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
COPY --chown=default:default --from=builder /build/packages/backend/dist/bundle.tar.gz ./
RUN tar xzf bundle.tar.gz && rm bundle.tar.gz

COPY --chown=default:default --from=builder /build/examples ./examples
COPY --chown=default:default --from=builder /build/rbac-policy.csv ./
COPY --chown=default:default --from=builder /build/rbac-policy-extensions.csv /tmp/rbac-policy-extensions.csv
RUN cat /tmp/rbac-policy-extensions.csv >> /app/rbac-policy.csv && rm /tmp/rbac-policy-extensions.csv

COPY --chown=default:default --from=builder /build/app-config.yaml /build/app-config.production.yaml /build/app-config.distro.yaml /build/app-config.dynamic-plugins.yaml ./
COPY --chown=default:default --from=builder /build/app-config.azure.yaml /build/app-config.github.yaml /build/app-config.gitlab.yaml /build/app-config.keycloak.yaml /build/app-config.ldap.yaml ./
COPY --chown=default:default --from=builder /build/profiles/*.yaml ./

# Dynamic plugins: built artifacts + pre-installation
COPY --chown=default:default --from=builder /build/dynamic-plugins-store /app/dynamic-plugins/dist

# Pre-install local plugins (best-effort; missing artifacts skipped silently
# so the image still builds when a plugin is dropped from the workspace).
# The mkdir is required: without it, `cp -a <plugin> dynamic-plugins-root/`
# on the first iteration would copy the plugin's *contents* as the directory
# itself (since the destination doesn't exist yet), leaving the plugin
# unscannable and polluting startup logs with ENOENT errors for dist/, src/, …
RUN set -e; \
    mkdir -p /app/dynamic-plugins-root; \
    for plugin in \
      backstage-community-plugin-rbac \
      backstage-community-plugin-tech-radar-dynamic \
      backstage-community-plugin-tech-radar-backend-dynamic \
      veecode-platform-plugin-veecode-global-header-dynamic \
      veecode-platform-plugin-veecode-homepage-dynamic \
      veecode-platform-backstage-plugin-about-backend-dynamic \
      veecode-platform-backstage-plugin-about-dynamic \
      devportal-marketplace-backend-dynamic-dynamic \
      devportal-pending-changes-dynamic \
      devportal-marketplace-frontend-dynamic \
    ; do \
      if [ -d "/app/dynamic-plugins/dist/$plugin" ]; then \
        cp -a "/app/dynamic-plugins/dist/$plugin" /app/dynamic-plugins-root/; \
      fi; \
    done

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
        echo "patched catalog-backend-module-extensions for Backstage 1.50 (/alpha -> main catalogProcessingExtensionPoint)"; \
      fi; \
    else \
      echo "WARN: failed to fetch RHDH extensions OCI image $OCI_IMAGE — skipping"; \
    fi; \
    rm -rf "$TMP_OCI" "$TMP_EXTRACT"

# Plugin install scripts + config files consumed at startup
COPY --chown=default:default --from=builder /build/dynamic-plugins.yaml /app/
COPY --chown=default:default --from=builder /build/dynamic-plugins.default.yaml /app/
COPY --chown=default:default --from=builder /build/extensions-install.yaml /app/
COPY --chown=default:default --from=builder /build/presets /app/presets
COPY --chown=default:default --from=builder /build/docker/install-dynamic-plugins.py /app/install-dynamic-plugins.py
COPY --chown=default:default --chmod=755 --from=builder /build/docker/install-dynamic-plugins.sh /app/install-dynamic-plugins.sh

# Marketplace catalog entities (baked-in fallback; entrypoint refreshes from OCI at boot)
COPY --chown=default:default --from=builder /build/catalog-entities /app/catalog-entities
RUN mkdir -p /app/catalog-entities/extensions/plugins \
            /app/catalog-entities/extensions/packages \
            /app/catalog-entities/extensions/collections

# Version stamp consumed by the about plugin
ARG DEVPORTAL_VERSION=dev
RUN echo "{\"version\":\"${DEVPORTAL_VERSION}\"}" > /app/devportal.json

# Entrypoint
COPY --chown=default:default --chmod=755 --from=builder /build/entrypoint.sh /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "packages/backend", "--config", "app-config.yaml", "--config", "app-config.production.yaml", "--config", "/app/dynamic-plugins-root/app-config.dynamic-plugins.yaml"]
