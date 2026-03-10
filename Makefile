.PHONY: build build-server build-helper build-frontend dev serve test test-integration clean

BIN_DIR := bin
FRONTEND_DIR := frontend

VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
COMMIT  ?= $(shell git rev-parse HEAD 2>/dev/null || echo unknown)
LDFLAGS := -X github.com/tjst-t/fileshelf/internal/version.Version=$(VERSION) \
           -X github.com/tjst-t/fileshelf/internal/version.Commit=$(COMMIT)

build: build-server build-helper build-frontend

build-server:
	go build -ldflags "$(LDFLAGS)" -o $(BIN_DIR)/fileshelf-server ./cmd/server

build-helper:
	go build -ldflags "$(LDFLAGS)" -o $(BIN_DIR)/fileshelf-helper ./cmd/helper

build-frontend:
	cd $(FRONTEND_DIR) && npm ci && npm run build

dev:
	FILESHELF_DEV=1 go run ./cmd/server -config config.yaml

PID_FILE := /tmp/fileshelf-dev.pid
LOG_FILE := /tmp/fileshelf-dev.log
PORTMAN_ENV := /tmp/fileshelf-portman.env

serve: build-server build-frontend
	@if [ -f $(PID_FILE) ]; then \
	  OLD_PID=$$(cat $(PID_FILE)); \
	  if kill -0 $$OLD_PID 2>/dev/null; then \
	    echo "==> Killing previous fileshelf-server (PID: $$OLD_PID)..."; \
	    kill $$OLD_PID; \
	    for i in $$(seq 1 50); do kill -0 $$OLD_PID 2>/dev/null || break; sleep 0.1; done; \
	    kill -0 $$OLD_PID 2>/dev/null && kill -9 $$OLD_PID 2>/dev/null || true; \
	  fi; \
	  rm -f $(PID_FILE); \
	fi
	@portman env --name api --expose --output $(PORTMAN_ENV)
	@. $(PORTMAN_ENV) && \
	  echo "==> Starting fileshelf-server on port $$API_PORT (log: $(LOG_FILE))" && \
	  FILESHELF_DEV=1 nohup $(BIN_DIR)/fileshelf-server -config config.yaml -port $$API_PORT > $(LOG_FILE) 2>&1 & \
	  echo $$! > $(PID_FILE) && \
	  echo "    PID: $$(cat $(PID_FILE))"

test:
	go test ./...

test-integration:
	@echo "=== Running integration tests (requires root) ==="
	scripts/setup-test-env.sh
	go test -tags=integration -v ./internal/helper/...
	scripts/teardown-test-env.sh

clean:
	rm -rf $(BIN_DIR)
	rm -rf $(FRONTEND_DIR)/dist
