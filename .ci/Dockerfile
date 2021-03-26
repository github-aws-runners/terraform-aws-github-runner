#syntax=docker/dockerfile:1.2
FROM node:12 as build
WORKDIR /lambda
RUN apt-get update \
        && apt-get install -y zip \
        && rm -rf /var/lib/apt/lists/*

FROM build as runner-binaries-syncer
COPY modules/runner-binaries-syncer/lambdas/runner-binaries-syncer /lambda
RUN --mount=type=cache,target=/lambda/node_modules,id=runner-binaries-syncer \
        yarn install && yarn dist

FROM build as runners
COPY modules/runners/lambdas/runners /lambda
RUN --mount=type=cache,target=/lambda/node_modules,id=runners \
        yarn install && yarn dist

FROM build as webhook
COPY modules/webhook/lambdas/webhook /lambda
RUN --mount=type=cache,target=/lambda/node_modules,id=webhook \
        yarn install && yarn dist

FROM scratch as final
COPY --from=runner-binaries-syncer /lambda/runner-binaries-syncer.zip /runner-binaries-syncer.zip
COPY --from=runners                /lambda/runners.zip                /runners.zip
COPY --from=webhook                /lambda/webhook.zip                /webhook.zip
