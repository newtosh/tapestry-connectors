.PHONY: help build build-all package package-all

CONNECTORS := com.polygon.feed com.uncrate.feed com.gearpatrol.feed com.coolmaterial.steals.feed com.newtosh.youtube.playlist

help:
	@echo "Tapestry Connectors"
	@echo ""
	@echo "  make build          Build all connector assets"
	@echo "  make build-all      Same as build"
	@echo "  make package        Package all connectors"
	@echo "  CONNECTOR_ID=… make build|package   One connector only"
	@echo ""
	@echo "Mac mini: ./scripts/mac-mini-update.sh  (see docs/DEVELOPMENT.md)"

build: build-all

build-all:
	@for id in $(CONNECTORS); do \
		echo "→ $$id"; \
		CONNECTOR_ID=$$id bash scripts/build-connector.sh; \
	done

package: build-all package-all

package-all:
	@for id in $(CONNECTORS); do \
		echo "→ $$id"; \
		CONNECTOR_ID=$$id bash scripts/package-connector.sh; \
	done
