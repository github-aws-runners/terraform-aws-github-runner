#!/bin/sh

set -eu

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-000000000000}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test-only}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-eu-west-1}"
export AWS_REGION="${AWS_REGION:-eu-west-1}"
export AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://localhost:4566}"
export AWS_EC2_METADATA_DISABLED="${AWS_EC2_METADATA_DISABLED:-true}"

action="${1:-}"
example="${2:-}"
tfvars_file="${3:-${MINISTACK_TFVARS_FILE:-}}"
iac_binary="${IAC_BINARY:-terraform}"

case "$iac_binary" in
  terraform | tofu) ;;
  *)
    echo "Supported IaC binaries are: terraform, tofu" >&2
    exit 64
    ;;
esac

case "$example" in
  base | prebuilt | default | ephemeral | multi-runner | multi-runner-v2)
    use_tfvars=true
    ;;
  migration-test | termination-watcher)
    use_tfvars=false
    ;;
  *)
  echo "Supported examples for the runner are: base, prebuilt, default, ephemeral, multi-runner, multi-runner-v2, migration-test, termination-watcher" >&2
  exit 64
  ;;
esac

case "$action" in
  init | plan | apply | destroy) ;;
  *)
    echo "Usage: $0 {init|plan|apply|destroy} {base|prebuilt|default|ephemeral|multi-runner|multi-runner-v2|migration-test|termination-watcher} [TFVARS_FILE]" >&2
    exit 64
    ;;
esac

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
source_root=$(CDPATH='' cd -- "$script_dir/../.." && pwd)
example_root="$source_root/examples/$example"
lockfile="$example_root/.terraform.lock.hcl"
lockfile_directory="$example_root"
if [ "$example" = "migration-test" ]; then
  lockfile="$example_root/v1/.terraform.lock.hcl"
  lockfile_directory="$example_root/v1"
fi
expected_lockfile=".terraform.lock.hcl"
if [ "$iac_binary" = tofu ]; then
  expected_lockfile="$expected_lockfile.tofu"
fi
lockfile_name="${IAC_LOCK_FILE:-$expected_lockfile}"
if [ "$lockfile_name" != "$expected_lockfile" ]; then
  echo "Lock file does not match IaC binary: $lockfile_name (expected $expected_lockfile)" >&2
  exit 64
fi
case "$lockfile_name" in
  .terraform.lock.hcl | .terraform.lock.hcl.tofu) ;;
  *)
    echo "Supported IaC lock files are: .terraform.lock.hcl, .terraform.lock.hcl.tofu" >&2
    exit 64
    ;;
esac
tool_lockfile="$lockfile_directory/$lockfile_name"
lockfile_backup=""
lockfile_existed=false

if [ "$use_tfvars" = true ]; then
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
fi

lambda_fixture_dir=""
lambda_created_paths=""
ami_created_ids=""
ssm_created_names=""
override_created_paths=""
migration_state_backup=""
migration_v2_lockfile_backup=""
migration_v2_lockfile_existed=false
migration_iam_policy_v1_snapshot=""
migration_iam_policy_v2_snapshot=""
lambda_zip_paths="
$source_root/lambdas/functions/ami-housekeeper/ami-housekeeper.zip
$source_root/lambdas/functions/control-plane/runners.zip
$source_root/lambdas/functions/gh-agent-syncer/runner-binaries-syncer.zip
$source_root/lambdas/functions/webhook/webhook.zip
$source_root/lambdas/functions/termination-watcher/termination-watcher.zip
"

cleanup() {
  if command -v restore_migration_v2_lockfile >/dev/null 2>&1; then
    restore_migration_v2_lockfile
  fi

  if command -v restore_lockfile >/dev/null 2>&1; then
    restore_lockfile
  fi

  for override_file in $override_created_paths; do
    rm -f "$override_file"
  done

  for name in $ssm_created_names; do
    ministack_aws ssm delete-parameter --name "$name" >/dev/null 2>&1 || true
  done

  for image_id in $ami_created_ids; do
    ministack_aws ec2 deregister-image --image-id "$image_id" >/dev/null 2>&1 || true
  done

  for lambda_zip in $lambda_created_paths; do
    rm -f "$lambda_zip"
  done

  if [ -n "$lambda_fixture_dir" ]; then
    rm -rf "$lambda_fixture_dir"
  fi

  if [ -n "$migration_state_backup" ]; then
    rm -f "$migration_state_backup"
  fi

  if [ -n "$migration_iam_policy_v1_snapshot" ]; then
    rm -f "$migration_iam_policy_v1_snapshot"
  fi

  if [ -n "$migration_iam_policy_v2_snapshot" ]; then
    rm -f "$migration_iam_policy_v2_snapshot"
  fi
}
trap cleanup EXIT INT TERM

select_lockfile() {
  if [ ! -f "$tool_lockfile" ]; then
    echo "IaC lock file not found: $tool_lockfile" >&2
    exit 66
  fi

  if [ "$tool_lockfile" = "$lockfile" ]; then
    return
  fi

  lockfile_backup=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-lock.XXXXXX")
  if [ -f "$lockfile" ]; then
    cp "$lockfile" "$lockfile_backup"
    lockfile_existed=true
  fi
  cp "$tool_lockfile" "$lockfile"
}

restore_lockfile() {
  if [ -z "$lockfile_backup" ]; then
    return
  fi

  if [ "$lockfile_existed" = true ]; then
    cp "$lockfile_backup" "$lockfile"
  else
    rm -f "$lockfile"
  fi
  rm -f "$lockfile_backup"
  lockfile_backup=""
}

select_lockfile

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

create_ssm_fixture() {
  name="$1"
  value="$2"

  if ministack_aws ssm get-parameter --name "$name" >/dev/null 2>&1; then
    return
  fi

  ministack_aws ssm put-parameter \
    --name "$name" \
    --type String \
    --value "$value" \
    --overwrite >/dev/null
  ssm_created_names="$ssm_created_names
$name"
}

create_ami_override() {
  override_file="$example_root/zz_ministack_ami_override.tf"
  printf '%s\n' \
    'module "runners" {' \
    '  ami = {' \
    '    filter = {' \
    '      name  = ["amzn2-ami-hvm-2.0.20231116.0-x86_64-gp2"]' \
    '      state = ["available"]' \
    '    }' \
    '    owners = ["amazon"]' \
    '  }' \
    '  enable_runner_binaries_syncer = false' \
    '}' \
    '' \
    'output "runners" {' \
    '  value = { lambda_syncer_name = null }' \
    '}' > "$override_file"
  override_created_paths="$override_created_paths
$override_file"
}

create_multi_runner_override() {
  override_file="$example_root/zz_ministack_override.tf"
  printf '%s\n' \
    'module "runners" {' \
    '  multi_runner_config = {' \
    '    for name, config in local.multi_runner_config :' \
    '    name => merge(config, {' \
    '      runner_config = merge(config.runner_config, {' \
    '        enable_runner_binaries_syncer = false' \
    '        ami = {' \
    '          filter = {' \
    '            name = [length(regexall("windows", name)) > 0 ? "Windows_Server-2022-English-Full-Base" : length(regexall("ubuntu", name)) > 0 ? "ubuntu/images/hvm-ssd/ubuntu-22.04-amd64-server" : "amzn2-ami-hvm-2.0.20231116.0-x86_64-gp2"]' \
    '            state = ["available"]' \
    '          }' \
    '          owners = [length(regexall("ubuntu", name)) > 0 ? "099720109477" : "amazon"]' \
    '        }' \
    '      })' \
    '    })' \
    '  }' \
    '}' > "$override_file"
  override_created_paths="$override_created_paths
$override_file"
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
    default | ephemeral)
      create_ami_override
      ;;
    prebuilt)
      create_ami_fixture \
        "amzn2-ami-hvm-2.0.20231116.0-x86_64-gp2" \
        x86_64 >/dev/null
      ;;
    multi-runner)
      create_multi_runner_override
      create_ssm_fixture \
        "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64" \
        "ami-0abcdef1234567890"
      create_ssm_fixture \
        "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-arm64" \
        "ami-0abcdef1234567890"
      ;;
    multi-runner-v2)
      create_ami_fixture "ministack-v2-linux-arm64" arm64 >/dev/null
      create_ami_fixture "ministack-v2-linux-x64" x86_64 >/dev/null
      create_ami_fixture "ministack-v2-windows-x64" x86_64 >/dev/null
      ;;
    migration-test)
      create_ami_fixture "migration-test-linux" x86_64 >/dev/null
      ;;
  esac
}

case "$action" in
  plan | apply | destroy)
    create_ministack_fixtures
    ;;
esac

iac_init() {
  "$iac_binary" -chdir="$example_root" init -backend=false -input=false -lockfile=readonly
}

iac_example() {
  if [ "$use_tfvars" = true ]; then
    "$iac_binary" -chdir="$example_root" "$@" -var-file="$tfvars_file"
  else
    "$iac_binary" -chdir="$example_root" "$@"
  fi
}

select_migration_v2_lockfile() {
  migration_v2_lockfile="$example_root/v2/.terraform.lock.hcl"
  migration_v2_tool_lockfile="$example_root/v2/$lockfile_name"

  if [ "$migration_v2_tool_lockfile" = "$migration_v2_lockfile" ]; then
    return
  fi

  migration_v2_lockfile_backup=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-migration-lock.XXXXXX")
  if [ -f "$migration_v2_lockfile" ]; then
    cp "$migration_v2_lockfile" "$migration_v2_lockfile_backup"
    migration_v2_lockfile_existed=true
  fi
  cp "$migration_v2_tool_lockfile" "$migration_v2_lockfile"
}

restore_migration_v2_lockfile() {
  if [ -z "$migration_v2_lockfile_backup" ]; then
    return
  fi

  if [ "$migration_v2_lockfile_existed" = true ]; then
    cp "$migration_v2_lockfile_backup" "$migration_v2_lockfile"
  else
    rm -f "$migration_v2_lockfile"
  fi
  rm -f "$migration_v2_lockfile_backup"
  migration_v2_lockfile_backup=""
}

iac_migration_init() {
  select_migration_v2_lockfile
  "$iac_binary" -chdir="$example_root/v1" init -reconfigure -input=false
  "$iac_binary" -chdir="$example_root/v2" init -reconfigure -input=false
}

iac_migration_example() {
  phase="$1"
  shift
  migration_example_root="$example_root/$phase"
  "$iac_binary" -chdir="$migration_example_root" "$@" -var-file="$migration_example_root/$phase.tfvars"
}

snapshot_migration_iam_policies() {
  python3 "$example_root/compare_iam_role_policies.py" snapshot "$1"
}

compare_migration_iam_policies() {
  python3 "$example_root/compare_iam_role_policies.py" compare "$1" "$2"
}

assert_migration_plan_is_empty() {
  phase="$1"
  if iac_migration_example "$phase" plan -input=false -detailed-exitcode; then
    return 0
  else
    status=$?
    if [ "$status" -eq 2 ]; then
      echo "Migration test produced a non-empty plan for $phase." >&2
    fi
    return "$status"
  fi
}

assert_migration_plan_has_no_infrastructure_changes() {
  phase="$1"
  migration_example_root="$example_root/$phase"

  plan_file=$(mktemp "${TMPDIR:-/tmp}/migration-test-plan.XXXXXX")
  plan_status=0
  if iac_migration_example "$phase" plan -input=false -out="$plan_file"; then
    plan_status=0
  else
    plan_status=$?
  fi
  if [ "$plan_status" -ne 0 ] && [ "$plan_status" -ne 2 ]; then
    rm -f "$plan_file"
    return "$plan_status"
  fi

  if "$iac_binary" -chdir="$migration_example_root" show -json "$plan_file" |
    python3 -c '
import json
import sys

unexpected = []
ignored_resource_types = {
    "aws_cloudwatch_log_group",
    "aws_iam_role_policy",
    "aws_ssm_parameter",
}
ignored_tag_keys = {"Name", "ghr:ssm_config_path"}

def without_ignored_attributes(value, resource_type):
    if not isinstance(value, dict):
        return value

    normalized = dict(value)
    ignored_attributes = {"tags", "tags_all"}
    if resource_type == "aws_lambda_function":
        ignored_attributes.update({"filename", "last_modified"})

    for attribute in ignored_attributes:
        tags = normalized.get(attribute)
        if attribute in {"tags", "tags_all"} and isinstance(tags, dict):
            normalized[attribute] = {
                key: tag_value
                for key, tag_value in tags.items()
                if key not in ignored_tag_keys
            }
        elif attribute in normalized:
            normalized.pop(attribute)
    return normalized

for resource in json.load(sys.stdin).get("resource_changes", []):
    if (
        resource.get("mode") != "managed"
        or resource.get("type") == "terraform_data"
        or resource.get("type") in ignored_resource_types
    ):
        continue
    address = resource.get("address", "")
    if not address.startswith("module.runners."):
        continue
    actions = resource.get("change", {}).get("actions", [])
    if actions == ["update"]:
        change = resource["change"]
        resource_type = resource.get("type")
        if (
            without_ignored_attributes(change.get("before"), resource_type)
            == without_ignored_attributes(change.get("after"), resource_type)
        ):
            continue
    if actions != ["no-op"]:
        address = resource.get("address", "<unknown>")
        action_text = ",".join(actions)
        unexpected.append(f"{address}: {action_text}")

if unexpected:
    print("Migration changed infrastructure resources:", file=sys.stderr)
    print("\\n".join(f"  {change}" for change in unexpected), file=sys.stderr)
    sys.exit(1)
'; then
    rm -f "$plan_file"
    return 0
  else
    plan_status=$?
    rm -f "$plan_file"
    return "$plan_status"
  fi
}

run_migration_test() {
  iac_migration_init
  iac_migration_example v1 apply -auto-approve -input=false

  migration_iam_policy_v1_snapshot=$(mktemp "${TMPDIR:-/tmp}/migration-test-iam-v1.XXXXXX")
  snapshot_migration_iam_policies "$migration_iam_policy_v1_snapshot"

  migration_state_backup=$(mktemp "${TMPDIR:-/tmp}/migration-test-state.XXXXXX")
  rm -f "$migration_state_backup"
  python3 "$source_root/scripts/migrate_multi_runner_state.py" \
    --working-directory "$example_root/v1" \
    --tool "$iac_binary" \
    --backup "$migration_state_backup" \
    --apply \
    --yes

  assert_migration_plan_has_no_infrastructure_changes v2
  iac_migration_example v2 apply -auto-approve -input=false

  migration_iam_policy_v2_snapshot=$(mktemp "${TMPDIR:-/tmp}/migration-test-iam-v2.XXXXXX")
  snapshot_migration_iam_policies "$migration_iam_policy_v2_snapshot"
  compare_migration_iam_policies "$migration_iam_policy_v1_snapshot" "$migration_iam_policy_v2_snapshot"

  assert_migration_plan_is_empty v2
}

case "$action" in
  init)
    if [ "$example" = "migration-test" ]; then
      iac_migration_init
    else
      iac_init
    fi
    ;;
  plan)
    if [ "$example" = "migration-test" ]; then
      iac_migration_init
      iac_migration_example v1 plan -input=false
    else
      iac_init
      iac_example plan -input=false
    fi
    ;;
  apply)
    if [ "$example" = "migration-test" ]; then
      run_migration_test
    else
      iac_init
      iac_example apply -auto-approve -input=false
    fi
    ;;
  destroy)
    if [ "$example" = "migration-test" ]; then
      iac_migration_init
      iac_migration_example v2 destroy -auto-approve -input=false
    else
      iac_init
      iac_example destroy -auto-approve -input=false
    fi
    ;;
esac
