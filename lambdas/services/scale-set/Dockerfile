FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS build
WORKDIR /workspace/lambdas

COPY lambdas/package.json lambdas/yarn.lock lambdas/.yarnrc.yml ./
COPY lambdas/.yarn ./.yarn
COPY lambdas/tsconfig.json lambdas/vitest.base.config.ts ./
COPY lambdas/functions ./functions
COPY lambdas/libs ./libs
COPY lambdas/services ./services

RUN corepack enable && yarn install --immutable
RUN yarn workspace @aws-github-runner/scale-set-service build

FROM node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS runtime
ENV NODE_ENV=production \
    SCALE_SET_HEALTH_PORT=8080
WORKDIR /app

COPY --from=build --chown=node:node /workspace/lambdas/services/scale-set/dist/ ./
COPY --from=build --chown=node:node /workspace/lambdas/services/scale-set/healthcheck.cjs ./healthcheck.cjs

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 CMD ["node", "/app/healthcheck.cjs"]
ENTRYPOINT ["node", "--disable-proto=delete", "/app/index.js"]
