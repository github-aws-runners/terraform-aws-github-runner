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

ministack_endpoint="${AWS_ENDPOINT_URL:-http://127.0.0.1:4566}"
case "$ministack_endpoint" in
  http://127.0.0.1:4566)
    # S3 Control prefixes the account ID to the endpoint hostname. The
    # account-prefixed localhost name resolves locally, while 127.0.0.1 does not.
    ministack_endpoint="http://localhost:4566"
    ;;
  http://localhost:4566 | http://ministack:4566) ;;
  *)
    echo "Refusing to run against non-MiniStack endpoint: $ministack_endpoint" >&2
    exit 65
    ;;
esac

service_endpoint_variables=$(
  env | awk -F= '
    $1 ~ /^AWS_ENDPOINT_URL_/ || $1 ~ /^AWS_[A-Z0-9_]+_ENDPOINT$/ { print $1 }
  '
)
if [ -n "$service_endpoint_variables" ]; then
  echo "Refusing to run with service-specific AWS endpoint variables:" >&2
  printf '%s\n' "$service_endpoint_variables" >&2
  exit 65
fi

# Always use synthetic credentials and route every AWS client to MiniStack.
export AWS_ACCESS_KEY_ID="000000000000"
export AWS_CONFIG_FILE="/dev/null"
export AWS_DEFAULT_REGION="eu-west-1"
export AWS_EC2_METADATA_DISABLED="true"
export AWS_ENDPOINT_URL="$ministack_endpoint"
export AWS_IGNORE_CONFIGURED_ENDPOINT_URLS="false"
export AWS_REGION="eu-west-1"
export AWS_SECRET_ACCESS_KEY="ministack-test-only"
export AWS_SHARED_CREDENTIALS_FILE="/dev/null"
unset AWS_ACCESS_KEY AWS_DEFAULT_PROFILE AWS_PROFILE AWS_SECRET_KEY AWS_SECURITY_TOKEN AWS_SESSION_TOKEN

ministack_no_proxy="localhost,127.0.0.1,ministack,.ministack,000000000000.ministack"
export NO_PROXY="${NO_PROXY:+$NO_PROXY,}$ministack_no_proxy"
export no_proxy="${no_proxy:+$no_proxy,}$ministack_no_proxy"

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
source_root="${GITHUB_WORKSPACE:-$(CDPATH='' cd -- "$script_dir/../.." && pwd)}"
temporary_root="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
runtime_root="$temporary_root/terraform-aws-github-runner-ministack-$example"
example_root="$source_root/examples/$example"
fixture_root="$source_root/tests/ministack/setup"
input_file="$source_root/tests/ministack/inputs/$example.tfvars"

fixture_data_dir="$runtime_root/fixture-data"
fixture_state="$runtime_root/fixture.tfstate"
lambda_archive="$runtime_root/lambda.zip"
example_data_dir="$runtime_root/example-data"
example_state="$runtime_root/example.tfstate"
permissions_data_dir="$runtime_root/permissions-data"
permissions_state="$runtime_root/permissions.tfstate"

terraform_fixture() {
  subcommand="$1"
  shift
  TF_DATA_DIR="$fixture_data_dir" terraform -chdir="$fixture_root" "$subcommand" "$@" \
    -state="$fixture_state" \
    -var="lambda_archive_path=$lambda_archive"
}

terraform_permissions() {
  subcommand="$1"
  shift
  TF_DATA_DIR="$permissions_data_dir" terraform -chdir="$example_root/setup" "$subcommand" "$@" \
    -state="$permissions_state"
}

terraform_example() {
  subcommand="$1"
  shift
  set -- "$subcommand" "$@" "-state=$example_state"

  if [ -f "$input_file" ]; then
    set -- "$@" "-var-file=$input_file"
  fi

  case "$example" in
    default)
      set -- "$@" \
        "-var=webhook_lambda_zip=$lambda_archive" \
        "-var=runners_lambda_zip=$lambda_archive" \
        "-var=runner_binaries_syncer_lambda_zip=$lambda_archive" \
        "-var=ami_housekeeper_lambda_zip=$lambda_archive" \
        "-var=termination_watcher_lambda_zip=$lambda_archive"
      ;;
    ephemeral | external-managed-ssm-secrets | multi-runner)
      set -- "$@" \
        "-var=webhook_lambda_zip=$lambda_archive" \
        "-var=runners_lambda_zip=$lambda_archive" \
        "-var=runner_binaries_syncer_lambda_zip=$lambda_archive"
      ;;
    permissions-boundary)
      set -- "$@" \
        "-var=webhook_lambda_zip=$lambda_archive" \
        "-var=runners_lambda_zip=$lambda_archive" \
        "-var=runner_binaries_syncer_lambda_zip=$lambda_archive" \
        "-var=iam_state_path=$permissions_state"
      ;;
    prebuilt)
      set -- "$@" \
        "-var=webhook_lambda_zip=$lambda_archive" \
        "-var=runners_lambda_zip=$lambda_archive" \
        "-var=ami_housekeeper_lambda_zip=$lambda_archive"
      ;;
    termination-watcher)
      set -- "$@" "-var=termination_watcher_lambda_zip=$lambda_archive"
      ;;
  esac

  # This module calls the GitHub API through local-exec, so it is deliberately
  # outside the AWS/MiniStack lifecycle coverage.
  case "$example" in
    default | ephemeral | multi-runner | prebuilt)
      set -- "$@" "-target=module.runners"
      ;;
  esac

  TF_DATA_DIR="$example_data_dir" terraform -chdir="$example_root" "$@"
}

case "$action" in
  prepare)
    if [ -e "$runtime_root" ]; then
      echo "Refusing to overwrite existing MiniStack runtime: $runtime_root" >&2
      exit 73
    fi

    if [ ! -f "$example_root/main.tf" ]; then
      echo "The repository does not contain examples/$example/main.tf" >&2
      exit 66
    fi

    mkdir -p "$runtime_root"
    ;;
  fixture-apply)
    TF_DATA_DIR="$fixture_data_dir" terraform -chdir="$fixture_root" init -backend=false -input=false -lockfile=readonly
    terraform_fixture apply -auto-approve -input=false

    if [ ! -f "$lambda_archive" ]; then
      echo "The shared fixture did not create the inert Lambda archive." >&2
      exit 74
    fi
    ;;
  setup-apply)
    if [ "$example" != "permissions-boundary" ]; then
      exit 0
    fi

    TF_DATA_DIR="$permissions_data_dir" terraform -chdir="$example_root/setup" init -backend=false -input=false -lockfile=readonly
    terraform_permissions apply -auto-approve -input=false
    ;;
  init)
    TF_DATA_DIR="$example_data_dir" terraform -chdir="$example_root" init -backend=false -input=false -lockfile=readonly
    ;;
  apply)
    terraform_example apply -auto-approve -input=false
    ;;
  destroy)
    TF_DATA_DIR="$example_data_dir" terraform -chdir="$example_root" init -backend=false -input=false -lockfile=readonly
    terraform_example destroy -auto-approve -input=false
    ;;
  setup-destroy)
    if [ "$example" != "permissions-boundary" ]; then
      exit 0
    fi

    TF_DATA_DIR="$permissions_data_dir" terraform -chdir="$example_root/setup" init -backend=false -input=false -lockfile=readonly
    terraform_permissions destroy -auto-approve -input=false
    ;;
  fixture-destroy)
    TF_DATA_DIR="$fixture_data_dir" terraform -chdir="$fixture_root" init -backend=false -input=false -lockfile=readonly
    terraform_fixture destroy -auto-approve -input=false
    ;;
esac
