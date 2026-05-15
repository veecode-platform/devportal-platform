# ADR-012: Pull UBI from the anonymous mirror (`registry.access.redhat.com`)

## Status

Accepted — 2026-05-14.

Refines ADR-003 ("UBI10 Node.js as Container Base") inherited from
`devportal-base`. ADR-003 stands: the base image is still
`ubi10/nodejs-22`, same tag stream, same content. This ADR only chooses
*which registry hostname* to pull it from.

## Context

`devportal-base` and `devportal-distro` pull UBI from
`registry.redhat.io/ubi10/nodejs-22`, which requires Red Hat registry
authentication at pull time. The org configures `REDHAT_USER` /
`REDHAT_PASS` secrets, every CI workflow logs in with `docker login` /
`skopeo login` before any `FROM` or tag query, and contributors building
locally need their own Red Hat developer account.

For `devportal-platform` we inherited this pattern by default. The
question this ADR resolves: is the authentication a technical
requirement of UBI, or historical inertia?

## Decision

Pull the base image from **`registry.access.redhat.com/ubi10/nodejs-22`**
(anonymous mirror) instead of `registry.redhat.io/ubi10/nodejs-22`
(authenticated). The base image, tag, and digest are unchanged.

## Rationale

Red Hat operates **two** registries for UBI on purpose, and the
distinction is contractual, not technical:

- **`registry.redhat.io`** — authenticated. Hosts the full Red Hat
  catalog including entitled / paid content (RHEL itself, OpenShift
  layered products, etc.). UBI is also published here for completeness.
  Authentication is used for telemetry, terms-of-use acceptance, and
  entitlement tracking.
- **`registry.access.redhat.com`** — anonymous. UBI-only mirror, exists
  *specifically* because UBI is contractually "freely redistributable".
  Non-UBI content is not mirrored here. This is Red Hat's documented
  public-distribution channel for UBI.

The two registries serve the **same UBI image bit-for-bit**. Verified
by direct comparison of our pinned tag (`10.1-1775712813`):

```
$ skopeo inspect docker://registry.access.redhat.com/ubi10/nodejs-22:10.1-1775712813
  Digest: sha256:16deb5f4f617222dfc5863137aac1507f205bd92ae45368ea0aea01fdc16ad03
  Labels: name=ubi10/nodejs-22, vendor="Red Hat, Inc.",
          version=10.1, release=1775712813
```

Same digest, same labels, same release timestamp, same dnf repos baked
into `/etc/yum.repos.d/` (so all `dnf install` steps in the Dockerfile
continue to work unchanged). The `10.1-*` tag stream tracks 1:1 between
the two registries.

## Consequences

### Benefits

- **No Red Hat credentials needed for build**. `REDHAT_USER` /
  `REDHAT_PASS` secrets are not required by `publish.yml` or
  `automated-update.yml`.
- **Friction-free local build**. Contributors do not need a Red Hat
  developer account to `docker build .` on their laptop.
- **Fork-safe by default** for any future PR-time build workflow.
  Whoever re-introduces one will not have to design around missing
  secret access in fork-PR runs.
- **One less org-level secret** to provision when bootstrapping new
  related repos. (`devportal-base` and `devportal-distro` still use
  the gated registry — they pre-date this decision, and we are not
  retrofitting them.)

### Trade-offs

- **Anonymous rate limits** on `registry.access.redhat.com`. Applied
  per source IP. In GitHub Actions, hosted runners come from a rotating
  pool, so per-IP anonymous limits have not been observed to bite our
  build volume. Authenticated pulls have a higher ceiling; if we ever
  saturate the anonymous limit (e.g. matrix builds across many
  platforms hammering the same runner pool), we can opt back into
  `registry.redhat.io` for `publish.yml` specifically.
- **Loss of pull telemetry** to Red Hat. We were not relying on this,
  and Red Hat does not provide it back to UBI consumers anyway.

### Risk acknowledged

If Red Hat one day discontinues `registry.access.redhat.com` or gates
it, this is a one-line revert of the `FROM` and reinstating the
`docker login` / `skopeo login` steps. Both the image and the secrets
contract are well-defined elsewhere (ADR-003; `devportal-base`'s
existing workflow). The probability is low — `registry.access.redhat.com`
has been the anonymous-UBI channel for ~7 years, and gating it would
undermine the public "freely redistributable" guarantee that is UBI's
whole product position.

## Out of scope

- **`devportal-base` and `devportal-distro`.** They keep
  `registry.redhat.io`. Switching them is a parallel change of equal
  shape but lives in those repos' own change history. Not blocking,
  not driven by this ADR.

## Related files

- `Dockerfile` (line referencing `NODE_BASE`)
- `.github/workflows/publish.yml`
- `.github/workflows/automated-update.yml`
- ADR-003 in `devportal-base` (chose UBI10; this ADR refines *where* we
  pull it from)
