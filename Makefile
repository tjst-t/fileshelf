.PHONY: build build-server build-helper build-frontend dev test clean

BIN_DIR := bin
FRONTEND_DIR := frontend

build: build-server build-helper build-frontend

build-server:
	go build -o $(BIN_DIR)/fileshelf-server ./cmd/server

build-helper:
	go build -o $(BIN_DIR)/fileshelf-helper ./cmd/helper

build-frontend:
	cd $(FRONTEND_DIR) && npm ci && npm run build

dev:
	FILESHELF_DEV=1 go run ./cmd/server -config config.yaml

test:
	go test ./...

clean:
	rm -rf $(BIN_DIR)
	rm -rf $(FRONTEND_DIR)/dist
