#syntax=docker/dockerfile:1.2
FROM node:20 as build
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
