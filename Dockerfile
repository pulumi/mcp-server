# Stage 1: Build stage
FROM node:22-alpine AS builder

# Install build dependencies
RUN apk add --no-cache curl

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build the TypeScript code
RUN npm run build

# Stage 2: Production stage
FROM node:22-alpine

# Install Pulumi CLI
RUN apk add --no-cache curl unzip \
    && curl -fsSL https://get.pulumi.com | sh \
    && mv /root/.pulumi/bin/pulumi /usr/local/bin/ \
    && rm -rf /root/.pulumi \
    && apk del curl unzip

# Create app directory
WORKDIR /app

# Create a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy built files from builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist/ ./dist/

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Set proper permissions
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Set environment variables
ENV NODE_ENV=production

# Command to run the application
ENTRYPOINT ["node", "dist/index.js"]