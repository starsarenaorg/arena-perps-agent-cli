FROM node:20-alpine

WORKDIR /app

# Copy package files and install all dependencies (including tsx)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Start with tsx, same as running locally
CMD ["npx", "tsx", "src/copytrading/index.ts"]
