#!/usr/bin/env bash -e

# Build all the lambda's, output on the default place (inside the lambda module)

cd lambdas
yarn install --frozen-lockfile
yarn run build
cd ..
