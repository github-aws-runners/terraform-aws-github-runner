#syntax=docker/dockerfile:1.2
FROM node@sha256:0c0734eb7051babbb3e95cd74e684f940552b31472152edf0bb23e54ab44a0d7 as build
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
