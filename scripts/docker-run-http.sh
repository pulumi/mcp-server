#!/bin/bash

set -e

# Configuration
IMAGE_NAME="pulumi/mcp-server"
TAG="latest"
PORT="3000"
CONTAINER_NAME="pulumi-mcp-server"

echo "Building Docker image: ${IMAGE_NAME}:${TAG}"
docker build -t "${IMAGE_NAME}:${TAG}" .

echo "Stopping and removing existing container if it exists..."
docker stop "${CONTAINER_NAME}" 2>/dev/null || true
docker rm "${CONTAINER_NAME}" 2>/dev/null || true

echo "Starting container in HTTP mode on port ${PORT}..."
docker run -d \
  --name "${CONTAINER_NAME}" \
  -p "${PORT}:${PORT}" \
  "${IMAGE_NAME}:${TAG}" \
  http

echo "Container started successfully!"
echo "MCP Server is running at: http://localhost:${PORT}"
echo ""
echo "To view logs: docker logs -f ${CONTAINER_NAME}"
echo "To stop: docker stop ${CONTAINER_NAME}"