# Build Stage
FROM node:20-alpine AS build

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the frontend
RUN npm run build

# Production Stage
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies (FFmpeg, Python for local AI)
RUN apk add --no-cache ffmpeg python3 py3-pip make g++

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --production

# Copy built assets from build stage
COPY --from=build /app/dist ./dist

# Copy server and other necessary files
COPY server.ts ./
COPY .env.example .env

# Create storage directories
RUN mkdir -p uploads outputs avatars

# Expose port 3000
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the server
CMD ["npx", "tsx", "server.ts"]
