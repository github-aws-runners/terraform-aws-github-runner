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
  base | prebuilt | termination-watcher) ;;
  *)
  echo "Supported examples for the tfvars-only runner are: base, prebuilt, termination-watcher" >&2
  exit 64
  ;;
esac

case "$action" in
  init | plan | apply | destroy) ;;
  *)
    echo "Usage: $0 {init|plan|apply|destroy} {base|prebuilt|termination-watcher} [TFVARS_FILE]" >&2
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

lambda_fixture_dir=""
lambda_created_paths=""
ami_created_ids=""
lambda_zip_paths="
$source_root/lambdas/functions/ami-housekeeper/ami-housekeeper.zip
$source_root/lambdas/functions/control-plane/runners.zip
$source_root/lambdas/functions/gh-agent-syncer/runner-binaries-syncer.zip
$source_root/lambdas/functions/webhook/webhook.zip
$source_root/lambdas/functions/termination-watcher/termination-watcher.zip
"

cleanup() {
  for image_id in $ami_created_ids; do
    ministack_aws ec2 deregister-image --image-id "$image_id" >/dev/null 2>&1 || true
  done

  for lambda_zip in $lambda_created_paths; do
    rm -f "$lambda_zip"
  done

  if [ -n "$lambda_fixture_dir" ]; then
    rm -rf "$lambda_fixture_dir"
  fi
}
trap cleanup EXIT INT TERM

ministack_aws() {
  aws --endpoint-url "$AWS_ENDPOINT_URL" --region "$AWS_DEFAULT_REGION" "$@"
}

wait_for_ministack() {
  attempts=60

  while ! curl -fsS --max-time 2 "$AWS_ENDPOINT_URL/_ministack/health" >/dev/null 2>&1; do
    attempts=$((attempts - 1))
    if [ "$attempts" -le 0 ]; then
      echo "MiniStack did not become ready at $AWS_ENDPOINT_URL." >&2
      exit 70
    fi
    sleep 1
  done
}

create_ami_fixture() {
  ami_name="$1"
  architecture="$2"
  ami_id=$(ministack_aws ec2 describe-images \
    --owners self \
    --filters "Name=name,Values=$ami_name" "Name=state,Values=available" \
    --query 'Images[0].ImageId' \
    --output text)

  if [ "$ami_id" = "None" ]; then
    ami_id=$(ministack_aws ec2 register-image \
      --name "$ami_name" \
      --description "MiniStack test-only AMI" \
      --architecture "$architecture" \
      --root-device-name /dev/xvda \
      --virtualization-type hvm \
      --image-location alpine:3.20 \
      --query 'ImageId' \
      --output text)
    ami_created_ids="$ami_created_ids
$ami_id"
  fi

}

create_ministack_fixtures() {
  if ! command -v aws >/dev/null 2>&1; then
    echo "AWS CLI is required to seed MiniStack API fixtures." >&2
    exit 69
  fi

  if ! command -v zip >/dev/null 2>&1; then
    echo "zip is required to create Lambda fixture packages." >&2
    exit 69
  fi

  if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required to check MiniStack readiness." >&2
    exit 69
  fi

  wait_for_ministack

  lambda_fixture_dir=$(mktemp -d "${TMPDIR:-/tmp}/terraform-aws-github-runner-ministack-lambda.XXXXXX")
  printf '%s\n' 'exports.handler = async () => ({ statusCode: 200, body: "ministack" });' > "$lambda_fixture_dir/index.js"
  (CDPATH='' cd -- "$lambda_fixture_dir" && zip -q ministack-lambda.zip index.js)

  for lambda_zip in $lambda_zip_paths; do
    if [ -e "$lambda_zip" ]; then
      continue
    fi
    mkdir -p "$(dirname "$lambda_zip")"
    cp "$lambda_fixture_dir/ministack-lambda.zip" "$lambda_zip"
    lambda_created_paths="$lambda_created_paths
$lambda_zip"
  done

  case "$example" in
    prebuilt)
      create_ami_fixture \
        "amzn2-ami-hvm-2.0.20231116.0-x86_64-gp2" \
        x86_64 >/dev/null
      ;;
  esac
}

case "$action" in
  plan | apply | destroy)
    create_ministack_fixtures
    ;;
esac

terraform_init() {
  terraform -chdir="$example_root" init -backend=false -input=false -lockfile=readonly
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
