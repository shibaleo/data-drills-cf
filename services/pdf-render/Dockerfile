# Build context: monorepo root (so we can copy pdf-core too).
# Render dashboard: rootDir = "" (repo root), Dockerfile path = "services/pdf-render/Dockerfile"
FROM node:22-slim

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable

# Copy workspace manifest + lockfile
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./

# Copy the two packages we need to build
COPY services/pdf-core/package.json services/pdf-core/package.json
COPY services/pdf-render/package.json services/pdf-render/package.json

# Install all deps for the affected packages
RUN pnpm install --filter @data-drills/pdf-render... --frozen-lockfile

# Copy sources
COPY services/pdf-core/ services/pdf-core/
COPY services/pdf-render/ services/pdf-render/

# Build the bundled output
RUN pnpm --filter @data-drills/pdf-render build

# Stage font assets next to dist/ so index.ts can resolve them via __dirname
RUN cp -r services/pdf-core/assets services/pdf-render/assets

WORKDIR /app/services/pdf-render

EXPOSE 3000

CMD ["node", "dist/index.js"]
