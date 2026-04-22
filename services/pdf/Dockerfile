FROM node:20-slim

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm install --production=false

# Build
COPY tsconfig.json build.mjs ./
COPY src/ src/
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Copy font assets
COPY assets/ assets/

EXPOSE 3000

CMD ["node", "dist/index.js"]
