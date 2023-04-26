#syntax=docker/dockerfile:1.2
FROM node:18 as build
WORKDIR /lambdas
RUN apt-get update \
        && apt-get install -y zip \
        && rm -rf /var/lib/apt/lists/*

FROM build as lambdas
COPY lambdas /lambdas
RUN --mount=type=cache,target=/work/node_modules,id=lambdas \
        yarn install --frozen-lockfile && yarn build

FROM scratch as final
COPY --from=lambdas /lambdas/functions/gh-agent-syncer/runner-binaries-syncer.zip /runner-binaries-syncer.zip
COPY --from=lambdas /lambdas/functions/control-plane/runners.zip                  /runners.zip
COPY --from=lambdas /lambdas/functions/webhook/webhook.zip                        /webhook.zip
