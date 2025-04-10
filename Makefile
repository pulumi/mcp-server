# Get version from package.json
VERSION := $(shell jq -r .version < package.json)

.PHONY: build
build:
	@echo "Building..."
	npm run build

.PHONY: test
test:
	@echo "Testing..."
	npm test

.PHONY: publish
publish: build test
	@echo "Publishing to NPMjs.com: ${VERSION}"
	npm publish --dry-run
	npm info 2>/dev/null 