# Stage 1: Build the React client
FROM node:20-alpine AS client-build

WORKDIR /app/client

# Copy client package files
COPY client/package*.json ./

# Install client dependencies
RUN npm ci

# Copy client source code
COPY client/ ./

# Build the React app
RUN npm run build

# Stage 2: Build the server
FROM node:20-alpine AS server-build

WORKDIR /app/server

# Copy server package files
COPY server/package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Stage 3: Production image
FROM node:20-alpine AS production

# Set environment to production
ENV NODE_ENV=production

# Install dumb-init for proper signal handling (graceful shutdown)
RUN apk add --no-cache dumb-init

# Create non-root user for security (Azure Container Apps best practice)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy server dependencies and source
COPY --from=server-build /app/server/node_modules ./server/node_modules
COPY --chown=nodejs:nodejs server/ ./server/

# Copy built client files to be served by the server
COPY --from=client-build --chown=nodejs:nodejs /app/client/dist ./client/dist

# Switch to non-root user
USER nodejs

# Azure Container Apps uses PORT environment variable (default 80)
# Our app defaults to 3001 if PORT is not set
ENV PORT=3001
EXPOSE 3001

# Set working directory to server
WORKDIR /app/server

# Health check for Azure Container Apps
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3001) + '/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Use dumb-init to handle signals properly (important for graceful shutdown)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]

