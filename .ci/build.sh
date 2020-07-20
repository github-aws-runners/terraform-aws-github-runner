#!/usr/bin/env bash

lambdaSrcDirs=("modules/runner-binaries-syncer/lambdas/runner-binaries-syncer" "modules/runners/lambdas/scale-runners" "modules/webhook/lambdas/webhook")
repoRoot=$(dirname "${BASH_SOURCE[0]}")/..

for lambdaDir in ${lambdaSrcDirs[@]}; do
    cd $repoRoot/${lambdaDir}
    docker build -t lambda -f ../../../../.ci/Dockerfile .
    docker create --name lambda lambda
    zipName=$(basename "$PWD")
    docker cp lambda:/lambda/${zipName}.zip ${zipName}.zip
    docker rm lambda
done
