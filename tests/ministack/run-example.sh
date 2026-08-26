#!/bin/sh

set -eu

action="${1:-}"
example="${2:-}"

case "$example" in
  base | default | ephemeral | external-managed-ssm-secrets | multi-runner | permissions-boundary | prebuilt | termination-watcher) ;;
  *)
    echo "Unsupported MiniStack example: $example" >&2
    exit 64
    ;;
esac

case "$action" in
  prepare | fixture-apply | setup-apply | init | apply | destroy | setup-destroy | fixture-destroy) ;;
  *)
    echo "Usage: $0 {prepare|fixture-apply|setup-apply|init|apply|destroy|setup-destroy|fixture-destroy} EXAMPLE" >&2
    exit 64
    ;;
esac

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
source_root="${GITHUB_WORKSPACE:-$(CDPATH='' cd -- "$script_dir/../.." && pwd)}"
temporary_root="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
worktree="$temporary_root/terraform-aws-github-runner-ministack-$example"
example_root="$worktree/examples/$example"
fixture_root="$worktree/tests/ministack/setup"
lambda_archive="$fixture_root/.terraform/ministack/lambda.zip"

terraform_example() {
  terraform -chdir="$example_root" "$@" -var="ministack_lambda_archive=$lambda_archive"
}

case "$action" in
  prepare)
    if [ -e "$worktree" ]; then
      echo "Refusing to overwrite existing MiniStack worktree: $worktree" >&2
      exit 73
    fi

    mkdir -p "$worktree"
    git -C "$source_root" archive --format=tar "${MINISTACK_SOURCE_REF:-${GITHUB_SHA:-HEAD}}" | tar -xf - -C "$worktree"

    if [ ! -f "$example_root/main.tf" ]; then
      echo "The isolated worktree does not contain examples/$example/main.tf" >&2
      exit 66
    fi

    cp "$worktree/tests/ministack/overrides/common.tf" "$example_root/ministack_common.tf"
    cp "$worktree/tests/ministack/overrides/${example}_override.tf" "$example_root/ministack_example_override.tf"
    cp "$worktree/tests/ministack/overrides/versions_override.tf" "$example_root/ministack_versions_override.tf"

    case "$example" in
      base | termination-watcher)
        cp "$worktree/tests/ministack/overrides/provider.tf" "$example_root/ministack_provider.tf"
        ;;
      permissions-boundary)
        cp "$worktree/tests/ministack/overrides/provider.tf" "$example_root/ministack_provider.tf"
        cp "$worktree/tests/ministack/overrides/permissions-boundary-provider_override.tf" "$example_root/ministack_permissions_provider_override.tf"
        ;;
      *)
        cp "$worktree/tests/ministack/overrides/provider.tf" "$example_root/ministack_provider_override.tf"
        ;;
    esac

    ;;
  fixture-apply)
    terraform -chdir="$fixture_root" init -backend=false -input=false -lockfile=readonly
    terraform -chdir="$fixture_root" apply -auto-approve -input=false
    ;;
  setup-apply)
    if [ "$example" != "permissions-boundary" ]; then
      exit 0
    fi

    terraform -chdir="$example_root/setup" init -backend=false -input=false -lockfile=readonly
    terraform -chdir="$example_root/setup" apply -auto-approve -input=false
    ;;
  init)
    terraform -chdir="$example_root" init -backend=false -input=false -lockfile=readonly
    ;;
  apply)
    terraform_example apply -auto-approve -input=false
    ;;
  destroy)
    terraform -chdir="$example_root" init -backend=false -input=false -lockfile=readonly
    terraform_example destroy -auto-approve -input=false
    ;;
  setup-destroy)
    if [ "$example" != "permissions-boundary" ]; then
      exit 0
    fi

    terraform -chdir="$example_root/setup" init -backend=false -input=false -lockfile=readonly
    terraform -chdir="$example_root/setup" destroy -auto-approve -input=false
    ;;
  fixture-destroy)
    terraform -chdir="$fixture_root" init -backend=false -input=false -lockfile=readonly
    terraform -chdir="$fixture_root" destroy -auto-approve -input=false
    ;;
esac
