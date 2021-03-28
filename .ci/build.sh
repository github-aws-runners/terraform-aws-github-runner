#!/usr/bin/env bash
set -e

# NOTE: This build requires docker buildkit integration which was introduced
#       in Docker v19.03+ and at least 4GB of memory available to the 
#       docker daemon

set -eou pipefail

TOP_DIR=$(git rev-parse --show-toplevel)
OUTPUT_DIR=${OUTPUT_DIR:-${TOP_DIR}/lambda_output}

mkdir -p "${OUTPUT_DIR}"

(
    set -x
    DOCKER_BUILDKIT=1 docker build \
        --target=final \
        --output=type=local,dest="${OUTPUT_DIR}" \
        -f "${TOP_DIR}/.ci/Dockerfile" \
        "${TOP_DIR}"
)
