# Base paths
DYNAMIC_PLUGINS_DIR=dynamic-plugins
DIST_DIR=$(DYNAMIC_PLUGINS_DIR)/dist

CURRENT_VERSION=$(shell cat package.json | jq -r .version)
NEXT_VERSION=$(shell echo $(CURRENT_VERSION) | awk -F. '{print $$1"."$$2"."$$3+1}')

# Command aliases
YARN=yarn
TURBO=turbo

.PHONY: all clean tsc build export-dynamic copy-dynamic-plugins check-dynamic-plugins full install root-install

## Installs root dependencies
root-install:
	$(YARN) install

## Installs dependencies within dynamic-plugins (depends on root-install)
install: root-install
	cd $(DYNAMIC_PLUGINS_DIR) && $(YARN) install

## Cleans build artifacts within dynamic-plugins
# This 'clean' target now depends on 'install' to ensure node_modules exist
clean: install
	cd $(DYNAMIC_PLUGINS_DIR) && $(YARN) clean

## Compiles TypeScript files within dynamic-plugins
# This 'tsc' target now depends on 'install' to ensure node_modules exist
tsc: install
	cd $(DYNAMIC_PLUGINS_DIR) && $(YARN) tsc 

## Builds dynamic plugins (optional, as export-dynamic depends on tsc)
build:
	cd $(DYNAMIC_PLUGINS_DIR) && $(YARN) build

## Exports dynamic plugins using janus-cli
export-dynamic:
	cd $(DYNAMIC_PLUGINS_DIR) && $(YARN) export-dynamic

## Copies dynamic plugins to the dist folder
copy-dynamic-plugins:
	cd $(DYNAMIC_PLUGINS_DIR) && $(YARN) copy-dynamic-plugins dist

## Runs the 'check-dynamic-plugins' script from the root
check-dynamic-plugins:
	$(YARN) check-dynamic-plugins

## Executes all steps in the correct order
# The 'full' target now implicitly runs 'install' via 'clean' and 'tsc'
full: clean tsc export-dynamic copy-dynamic-plugins check-dynamic-plugins
	@echo "✅ Dynamic plugins exported, copied to $(DIST_DIR), and checked."

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
	@echo "✅ Release $(CURRENT_VERSION) completed."
