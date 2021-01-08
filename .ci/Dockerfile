FROM node:12

RUN apt-get update \
    && apt-get install -y zip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /lambda

COPY . /lambda

RUN yarn install \
    && yarn run dist

