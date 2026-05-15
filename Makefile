CURRENT_VERSION=$(shell cat package.json | jq -r .version)
NEXT_VERSION=$(shell echo $(CURRENT_VERSION) | awk -F. '{print $$1"."$$2"."$$3+1}')

.PHONY: generate-release-notes push-release-and-tag release

generate-release-notes:
	./scripts/generate-release-notes.sh $(NEXT_VERSION)
	git add CHANGELOG.md

push-release-and-tag:
	@echo "Current version: $(CURRENT_VERSION)"
	@echo "Bump version to release $(NEXT_VERSION)"
	NEXT_VERSION=$(NEXT_VERSION) yq -i -o=json '.version = env(NEXT_VERSION)' package.json
	git add package.json
	git commit -m "Release version $(NEXT_VERSION)"
	git push origin main
	git tag -a $(NEXT_VERSION) -m "$(NEXT_VERSION)"
	git push origin $(NEXT_VERSION)

release: generate-release-notes push-release-and-tag
	@echo "Release $(CURRENT_VERSION) completed."
