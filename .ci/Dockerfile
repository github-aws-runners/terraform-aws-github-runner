#syntax=docker/dockerfile:1.2
FROM node@sha256:1501d5fd51032aa10701a7dcc9e6c72ab1e611a033ffcf08b6d5882e9165f63e as build
WORKDIR /lambdas
RUN apt-get update \
        && apt-get install -y zip \
        && rm -rf /var/lib/apt/lists/*

FROM build as lambdas
COPY lambdas /lambdas
RUN --mount=type=cache,target=/work/node_modules,id=lambdas \
        yarn install --frozen-lockfile && yarn dist && \
        find . -name "*.zip" -exec cp {} . \;

FROM scratch as final
COPY --from=lambdas /lambdas/*.zip /
