# Base image resmi Bun yang ringan
FROM oven/bun:1-alpine

WORKDIR /app

# Salin konfigurasi dependency monorepo untuk optimasi Docker layer caching
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/scrapper/package.json ./apps/scrapper/
COPY packages/db/package.json ./packages/db/

# Install dependencies monorepo
RUN bun install --frozen-lockfile

# Salin source code project
COPY . .

# Environment configuration
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

# Expose port
EXPOSE 3001

# Start command untuk backend API
CMD ["bun", "run", "start:api"]
