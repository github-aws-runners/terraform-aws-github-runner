#!/bin/bash
# shellcheck shell=bash

# Start the compiled lifecycle-hook server from the supplied ZIP artifact.

set -euo pipefail

readonly hook_node="${MICROVM_HOOK_NODE:-/opt/actions-runner/externals/node24/bin/node}"
readonly hook_server="${MICROVM_HOOK_SERVER:-/opt/microvm/server.js}"

if [[ ! -x "$hook_node" ]]; then
    printf '[microvm] Lifecycle hook Node executable is unavailable: %s\n' \
        "$hook_node" >&2
    exit 1
fi
if [[ ! -r "$hook_server" ]]; then
    printf '[microvm] Lifecycle hook server is unavailable: %s\n' \
        "$hook_server" >&2
    exit 1
fi

exec "$hook_node" "$hook_server"
