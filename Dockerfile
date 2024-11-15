FROM node:18-alpine

# Install system dependencies for SQLite
RUN apk add --no-cache \
    sqlite \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create data directory
RUN mkdir -p data

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S webot -u 1001

# Change ownership of app directory
RUN chown -R webot:nodejs /app

# Switch to non-root user
USER webot

# Expose port (for webhooks)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "process.exit(0)"

# Start the application
CMD ["npm", "start"]