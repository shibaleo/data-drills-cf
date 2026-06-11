# Build context: monorepo root.
# Build:  docker build -f services/pdf-lambda/Dockerfile -t pdf-lambda .
FROM public.ecr.aws/lambda/nodejs:20 AS builder

WORKDIR /build

RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY services/pdf-core/package.json services/pdf-core/package.json
COPY services/pdf-lambda/package.json services/pdf-lambda/package.json

RUN pnpm install --filter @data-drills/pdf-lambda... --frozen-lockfile

COPY services/pdf-core/ services/pdf-core/
COPY services/pdf-lambda/ services/pdf-lambda/

RUN pnpm --filter @data-drills/pdf-lambda build

# ── Runtime stage ──
FROM public.ecr.aws/lambda/nodejs:20

# Copy bundled output + font assets into LAMBDA_TASK_ROOT
COPY --from=builder /build/services/pdf-lambda/dist/ ${LAMBDA_TASK_ROOT}/dist/
COPY --from=builder /build/services/pdf-core/assets/ ${LAMBDA_TASK_ROOT}/assets/

CMD ["dist/index.handler"]
