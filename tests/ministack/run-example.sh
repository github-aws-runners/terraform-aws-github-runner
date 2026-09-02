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

fixture_dir=""
lambda_created_paths=""
lambda_zip_paths="
$source_root/lambdas/functions/ami-housekeeper/ami-housekeeper.zip
$source_root/lambdas/functions/control-plane/runners.zip
$source_root/lambdas/functions/gh-agent-syncer/runner-binaries-syncer.zip
$source_root/lambdas/functions/webhook/webhook.zip
$source_root/lambdas/functions/termination-watcher/termination-watcher.zip
"

cleanup() {
  if [ -n "$fixture_dir" ] && [ -f "$fixture_dir/terraform.tfstate" ]; then
    terraform -chdir="$fixture_dir" destroy -auto-approve -input=false >/dev/null 2>&1 || true
  fi

  for lambda_zip in $lambda_created_paths; do
    rm -f "$lambda_zip"
  done

  if [ -n "$fixture_dir" ]; then
    rm -rf "$fixture_dir"
  fi
}
trap cleanup EXIT INT TERM

create_ministack_fixtures() {
  fixture_dir=$(mktemp -d "${TMPDIR:-/tmp}/terraform-aws-github-runner-ministack-fixtures.XXXXXX")
  printf '%s\n' 'exports.handler = async () => ({ statusCode: 200, body: "ministack" });' > "$fixture_dir/index.js"
  cat > "$fixture_dir/main.tf" <<EOF
terraform {
  required_providers {
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.21"
    }
  }
}

provider "aws" {
  region                      = "$AWS_DEFAULT_REGION"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_region_validation      = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true
}

data "archive_file" "lambda" {
  type        = "zip"
  source_file = "$fixture_dir/index.js"
  output_path = "$fixture_dir/ministack-lambda.zip"
}

resource "aws_ssm_parameter" "al2023_x64" {
  name      = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64"
  type      = "String"
  value     = "ami-0a1b2c3d4e5f67890"
  count     = "$example" == "multi-runner" ? 1 : 0
  overwrite = true
}

resource "aws_ssm_parameter" "al2023_arm64" {
  name      = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-arm64"
  type      = "String"
  value     = "ami-0a1b2c3d4e5f67890"
  count     = "$example" == "multi-runner" ? 1 : 0
  overwrite = true
}
EOF

  terraform -chdir="$fixture_dir" init -backend=false -input=false -upgrade
  terraform -chdir="$fixture_dir" apply -auto-approve -input=false

  for lambda_zip in $lambda_zip_paths; do
    if [ -e "$lambda_zip" ]; then
      continue
    fi
    mkdir -p "$(dirname "$lambda_zip")"
    cp "$fixture_dir/ministack-lambda.zip" "$lambda_zip"
    lambda_created_paths="$lambda_created_paths
$lambda_zip"
  done
}

case "$action" in
  plan | apply | destroy)
    create_ministack_fixtures
    ;;
esac

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
