# Stage 1: Build
FROM node:18-slim AS builder

# Skip Chromium download during dependency install
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# Copy package files and tsconfig
COPY package*.json tsconfig.json ./

# Install all dependencies (development dependencies needed for tsc)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript and LIST contents for debugging
RUN npm run build && ls -R dist/

# Stage 2: Production
FROM node:18-slim

# Set working directory
WORKDIR /app

# Essential Puppeteer environment
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    HOME=/tmp \
    XDG_CONFIG_HOME=/tmp

# Install Chromium and system dependencies efficiently
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and public folder
COPY package*.json ./
COPY public/ ./public/

# Install production dependencies only
RUN npm ci --only=production

# Copy built files from builder
# We use absolute paths to be safe
COPY --from=builder /app/dist /app/dist

# Copy initialization script for Railway
COPY railway-init.sh /app/railway-init.sh
RUN chmod +x /app/railway-init.sh

# Create necessary directories and set permissions
RUN mkdir -p cookies logs data && chmod 777 cookies logs data

# Run as non-root user
RUN groupadd -r botuser && useradd -r -g botuser -G audio,video botuser \
    && chown -R botuser:botuser /app \
    && chown -R botuser:botuser /app/cookies /app/logs /app/data

USER botuser

# Start the bot using the initialization script
CMD ["/app/railway-init.sh"]
