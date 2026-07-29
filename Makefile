.PHONY: help build package

help:
	@echo "Tapestry Connectors"
	@echo ""
	@echo "  make build     Build connector assets (icon, plugin-config)"
	@echo "  make package   Build + create Downloads/*.tapestry"
	@echo ""
	@echo "Mac mini: ./scripts/mac-mini-update.sh  (see docs/DEVELOPMENT.md)"

build:
	@bash scripts/build-connector.sh

package: build
	@bash scripts/package-connector.sh
