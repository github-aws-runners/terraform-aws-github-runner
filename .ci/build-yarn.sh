#!/usr/bin/env bash

lambdaSrcDirs=("modules/runner-binaries-syncer/lambdas/runner-binaries-syncer" "modules/runners/lambdas/runners" "modules/webhook/lambdas/webhook")
repoRoot=$(dirname $(dirname $(realpath ${BASH_SOURCE[0]})))

for lambdaDir in ${lambdaSrcDirs[@]}; do
    cd "$repoRoot/${lambdaDir}"
    yarn && yarn run dist
done
