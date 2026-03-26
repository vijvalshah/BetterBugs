.PHONY: help dev build test lint clean docker-build

help:
	@echo "Available commands:"
	@echo "  make dev          - Run development server with hot reload"
	@echo "  make build        - Build the application"
	@echo "  make test         - Run tests"
	@echo "  make lint         - Run linter"
	@echo "  make clean        - Clean build artifacts"
	@echo "  make docker-build - Build Docker image"

dev:
	@echo "Starting development server..."
	go run main.go

build:
	@echo "Building application..."
	go build -o bin/api main.go

test:
	@echo "Running tests..."
	go test -v ./...

lint:
	@echo "Running linter..."
	golangci-lint run

clean:
	@echo "Cleaning..."
	rm -rf bin/
	go clean

docker-build:
	@echo "Building Docker image..."
	docker build -t bugcatcher-api:latest .

tidy:
	@echo "Tidying dependencies..."
	go mod tidy

swagger:
	@echo "Generating Swagger docs..."
	swag init
