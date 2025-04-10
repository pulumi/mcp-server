# Get version from package.json
VERSION := $(shell jq -r .version < package.json)

.PHONY: ensure
ensure:
	@echo "Ensuring..."
	npm install

.PHONY: build
build:
	@echo "Building..."
	npm run build

.PHONY: test
test:
	@echo "Testing..."
	npm test
