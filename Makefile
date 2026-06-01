CURRENT_VERSION := $(shell jq -r .version package.json)

# Release version resolution (single source of truth for the release mechanics;
# the release.yml workflow drives this with an explicit VERSION):
#   make release VERSION=2.1.0   → explicit version (patch / minor / major / prerelease)
#   make release BUMP=minor      → bump CURRENT_VERSION (patch | minor | major)
#   make release                 → defaults to BUMP=patch
BUMP ?= patch
ifdef VERSION
NEXT_VERSION := $(VERSION)
else
NEXT_VERSION := $(shell echo $(CURRENT_VERSION) | awk -F. -v b=$(BUMP) '{ \
	if (b=="major") print $$1+1".0.0"; \
	else if (b=="minor") print $$1"."$$2+1".0"; \
	else print $$1"."$$2"."$$3+1 }')
endif

.PHONY: check-version generate-release-notes push-release-and-tag release

# Defend against typos / shell metacharacters in VERSION before mutating anything.
check-version:
	@echo "$(NEXT_VERSION)" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$$' \
		|| { echo "ERROR: version '$(NEXT_VERSION)' is not valid semver (e.g. 2.1.0 or 2.1.0-rc.1)" >&2; exit 1; }

generate-release-notes: check-version
	./scripts/generate-release-notes.sh $(NEXT_VERSION)
	git add CHANGELOG.md

push-release-and-tag: check-version
	@echo "Current version: $(CURRENT_VERSION)"
	@echo "Releasing version: $(NEXT_VERSION)"
	NEXT_VERSION=$(NEXT_VERSION) yq -i -o=json '.version = env(NEXT_VERSION)' package.json
	git add package.json
	git commit -m "chore: release $(NEXT_VERSION)"
	git push origin HEAD:main
	git tag -a $(NEXT_VERSION) -m "$(NEXT_VERSION)"
	git push origin $(NEXT_VERSION)

release: generate-release-notes push-release-and-tag
	@echo "Release $(NEXT_VERSION) completed."
