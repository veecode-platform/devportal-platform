# RBAC

`devportal-platform` ships with RBAC enabled by default. The shipped
policy is a baseline (admin / developer / viewer); customer-specific
permissions are layered on at deploy time, not in the image.

This doc covers the policy shape, the default roles, and how to
override per deployment.

## What's enabled in the image

[`app-config.yaml`](../app-config.yaml#L156):

```yaml
permission:
  enabled: true
  rbac:
    policies-csv-file: ../../rbac-policy.csv
    pluginsWithPermission:
      - catalog
      - scaffolder
      - permission
    admin:
      users:
        - name: group:default/admins
        - name: group:default/backstage-admins
      superUsers:
        - name: group:default/admins
        - name: group:default/backstage-admins
```

[`app-config.production.yaml`](../app-config.production.yaml#L80):

```yaml
permission:
  rbac:
    policies-csv-file: ${RBAC_POLICY_PATH:-/app/rbac-policy.csv}
```

[`app-config.distro.yaml`](../app-config.distro.yaml) adds
`extensions` to `pluginsWithPermission` (so the marketplace's
permissions are visible).

The backend wires `@backstage-community/plugin-rbac-backend` plus
the `pluginIDProviderService` + `rbacDynamicPluginsProvider`
overrides ([`packages/backend/src/index.ts:206-213`](../packages/backend/src/index.ts)),
so dynamic plugins that expose permissions are discovered alongside
the static ones.

The frontend RBAC UI (`@backstage-community/plugin-rbac@^1.52.0`) is
the wrapper at `dynamic-plugins/wrappers/backstage-community-plugin-rbac/`,
**pre-installed** and **disabled by default**. The
[`recommended`](../presets/recommended.yaml) preset flips it on.

## Shipped roles

[`rbac-policy.csv`](../rbac-policy.csv) defines three roles:

### `role:default/admin`

Full access — all CRUD on the plugins-with-permission set.

Assigned to:

- `group:default/admins`
- `group:default/backstage-admins`
- `user:default/admin`

### `role:default/developer`

Read + create + refresh on catalog, scaffolder template/action + task
create/read, kubernetes read.

Assigned to:

- `group:default/developers`

### `role:default/viewer`

Read-only on catalog + scaffolder templates + kubernetes clusters.

Not assigned to any group out of the box — it's a target for custom
group mappings.

### Marketplace permissions

[`rbac-policy-extensions.csv`](../rbac-policy-extensions.csv) carries
the extension-marketplace-specific permissions, **appended to
`rbac-policy.csv` at Docker build time**
([`Dockerfile:189-190`](../Dockerfile)):

- `admin` — read + write plugin configuration (install/uninstall,
  enable/disable plugins via the marketplace UI).
- `developer` + `viewer` — read-only (browse marketplace, no
  install).

If you mount your own RBAC policy at `RBAC_POLICY_PATH`, the
extensions permissions are NOT auto-appended. Add them yourself if
you ship the marketplace.

## Permissions visible to RBAC

`pluginsWithPermission` controls which plugins' permissions appear in
the RBAC UI and are evaluated by the policy. Out of the box:
`catalog`, `scaffolder`, `permission`, `extensions`. Dynamic plugins
that expose permissions get added automatically via
`rbacDynamicPluginsProvider`.

Adding a new static plugin's permissions to the evaluation set is two
steps:

1. Add the plugin ID to `permission.rbac.pluginsWithPermission` (in
   `app-config.yaml` or a preset's `appConfig`).
2. Add the policy rows for that plugin to `rbac-policy.csv` (or your
   custom CSV mounted at `RBAC_POLICY_PATH`).

## Default groups and users

The image ships with `examples/org.yaml` containing minimal sample
groups/users so the default policy resolves to _something_ in a
fresh deployment. In production you ingest real Users/Groups from
your identity provider (Keycloak, LDAP, GitHub Org, msgraph) — that's
what the integration presets wire.

When you ingest real Users/Groups:

- The user-to-role mapping in `rbac-policy.csv` (the `g, …, role:default/admin`
  rows) needs to refer to your actual group refs, not the sample ones.
- The `admin.users` / `admin.superUsers` lists in `app-config` config
  also need to point at your admin groups.

## Customising RBAC per deployment

Don't fork the image. Mount a custom policy:

```bash
docker run -p 7007:7007 \
  -e RBAC_POLICY_PATH=/etc/devportal/rbac-policy.csv \
  -v $(pwd)/my-rbac-policy.csv:/etc/devportal/rbac-policy.csv:ro \
  -e VEECODE_PRESETS=recommended,github \
  veecode/devportal-platform:latest
```

Or via Kubernetes ConfigMap / Helm chart — same idea: the only
contract is that the file at `$RBAC_POLICY_PATH` is a Casbin CSV
that Backstage can parse.

If you want to keep the shipped roles as a baseline and add to them,
copy `rbac-policy.csv` + `rbac-policy-extensions.csv` from the image
into your override file and append.

## Policy file format

[Casbin policy format](https://casbin.org/docs/syntax-for-models)
with two kinds of rows:

**Permission policies** (`p`):

```csv
p, <role>, <resource>, <action>, <effect>
```

Where `<role>` is `role:default/<name>`, `<resource>` is a permission
name (e.g. `catalog.entity.read`, `scaffolder.task.create`,
`extensions.plugin.configuration.read`), `<action>` is `read` /
`create` / `update` / `delete` / `use`, and `<effect>` is `allow` /
`deny`.

**Role assignments** (`g`):

```csv
g, <user-or-group-entityref>, <role>
```

E.g. `g, group:default/admins, role:default/admin`.

There are two parallel permission-name conventions in our shipped
policy — the legacy ones (`catalog-entity`, `scaffolder-template`,
`scaffolder-action`, `policy-entity`) and the namespaced ones
(`catalog.entity.read`, `scaffolder.template.parameter.read`, …).
This is upstream Backstage's transitional state; we ship rows for
both so plugins on either side of the convention shift resolve.

## Managing RBAC at runtime

Three paths:

### Via CSV (declarative)

Edit `rbac-policy.csv` (or your mounted equivalent). Restart the
backend. Changes take effect immediately on boot.

### Via UI (`/rbac`)

The `recommended` preset enables the RBAC UI plugin. Admins can
create/edit roles and policies through the UI; changes are persisted
to the database (not back to the CSV). Useful for ad-hoc grants.

### Via REST API

```bash
USER_TOKEN="$(curl -s -X POST http://localhost:7007/api/auth/guest/refresh \
  -H 'Content-Type: application/json' -d '{}' | jq -r '.backstageIdentity.token')"

# List policies
curl -H "Authorization: Bearer $USER_TOKEN" \
  http://localhost:7007/api/permission/policies

# Create a policy (requires admin)
curl -X POST -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entityReference": "role:default/developer",
       "permission": "catalog.entity.read",
       "policy": "read",
       "effect": "allow"}' \
  http://localhost:7007/api/permission/policies
```

API-created policies persist to the database; restart-resilient.

## Troubleshooting

**"Permission denied" on something a user should have access to** —

1. Check the user's group memberships in the catalog (they must
   resolve to a group that has a role-assignment row in the CSV).
2. Check the role's permission rows for that resource.
3. The RBAC backend logs at info level on policy load; check for
   parse errors in the CSV.

**A new plugin's permissions don't show up** — confirm the plugin ID
is in `permission.rbac.pluginsWithPermission` and the plugin is
actually loaded (dynamic plugins show up only after their
`pluginConfig:` is merged in).

**Marketplace install/uninstall is blocked for admins** — the
`extensions.*` permissions live in `rbac-policy-extensions.csv` and
are appended to `rbac-policy.csv` only inside the image. If you
mounted your own policy, you replaced the entire file — re-include
the extensions rows.

**Guest auth users land as `user:default/admin`** — that's the wiring
in [`app-config.yaml`](../app-config.yaml#L100). Useful for local
dev; in production, an integration preset switches `auth.environment`
to `production` and disables guest.

## Reading list

- [Backstage permissions framework](https://backstage.io/docs/permissions/overview)
- [`@backstage-community/plugin-rbac` plugin docs](https://www.npmjs.com/package/@backstage-community/plugin-rbac)
- [Casbin policy syntax](https://casbin.org/docs/syntax-for-models)
- [`rbac-policy.csv`](../rbac-policy.csv) +
  [`rbac-policy-extensions.csv`](../rbac-policy-extensions.csv)
