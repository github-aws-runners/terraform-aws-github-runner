#!/bin/sh

set -eu

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-000000000000}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test-only}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-eu-west-1}"
export AWS_REGION="${AWS_REGION:-eu-west-1}"
export AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://127.0.0.1:4566}"
export AWS_EC2_METADATA_DISABLED="${AWS_EC2_METADATA_DISABLED:-true}"

action="${1:-}"
example="${2:-}"
tfvars_file="${3:-${MINISTACK_TFVARS_FILE:-}}"

case "$example" in
  base | default | ephemeral | multi-runner | prebuilt | termination-watcher) ;;
  *)
  echo "Supported examples for the tfvars-only runner are: base, default, ephemeral, multi-runner, prebuilt, termination-watcher" >&2
  exit 64
  ;;
esac

case "$action" in
  init | plan | apply | destroy) ;;
  *)
    echo "Usage: $0 {init|plan|apply|destroy} {base|default|ephemeral|multi-runner|prebuilt|termination-watcher} [TFVARS_FILE]" >&2
    exit 64
    ;;
esac

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
source_root=$(CDPATH='' cd -- "$script_dir/../.." && pwd)
example_root="$source_root/examples/$example"

if [ -z "$tfvars_file" ]; then
  tfvars_file="$script_dir/$example.tfvars"
fi

case "$tfvars_file" in
  /*) ;;
  *) tfvars_file="$PWD/$tfvars_file" ;;
esac

if [ ! -f "$tfvars_file" ]; then
  echo "Terraform variables file not found: $tfvars_file" >&2
  echo "Pass it as the third argument or set MINISTACK_TFVARS_FILE." >&2
  exit 66
fi

terraform_init() {
  terraform -chdir="$example_root" init -backend=false -input=false -upgrade
}

terraform_example() {
  terraform -chdir="$example_root" "$@" -var-file="$tfvars_file"
}

case "$action" in
  init)
    terraform_init
    ;;
  plan)
    terraform_init
    terraform_example plan -input=false
    ;;
  apply)
    terraform_init
    terraform_example apply -auto-approve -input=false
    ;;
  destroy)
    terraform_init
    terraform_example destroy -auto-approve -input=false
    ;;
esac
