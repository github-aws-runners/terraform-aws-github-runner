#!/bin/sh

set -eu

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-000000000000}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test-only}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-eu-west-1}"
export AWS_REGION="${AWS_REGION:-eu-west-1}"
export AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://localhost:4566}"
export AWS_EC2_METADATA_DISABLED="${AWS_EC2_METADATA_DISABLED:-true}"

action="${1:-}"
iac_binary="${IAC_BINARY:-terraform}"

case "$iac_binary" in
  terraform | tofu) ;;
  *)
    echo "Supported IaC binaries are: terraform, tofu" >&2
    exit 64
    ;;
esac

case "$action" in
  init | plan | apply | destroy) ;;
  *)
    echo "Usage: $0 {init|plan|apply|destroy}" >&2
    exit 64
    ;;
esac

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
source_root=$(CDPATH='' cd -- "$script_dir/../.." && pwd)
example_root="$source_root/examples/migration-test"
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
    echo "Supported lock files are: .terraform.lock.hcl, .terraform.lock.hcl.tofu" >&2
    exit 64
    ;;
esac

lockfile_backup_dir=""
lambda_fixture_dir=""
lambda_created_paths=""
ami_created_ids=""
migration_state_backup=""
migration_iam_policy_v1_snapshot=""
migration_iam_policy_v2_snapshot=""

lambda_zip_paths="
$source_root/lambdas/functions/ami-housekeeper/ami-housekeeper.zip
$source_root/lambdas/functions/control-plane/runners.zip
$source_root/lambdas/functions/gh-agent-syncer/runner-binaries-syncer.zip
$source_root/lambdas/functions/webhook/webhook.zip
$source_root/lambdas/functions/termination-watcher/termination-watcher.zip
"

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

prepare_lockfiles() {
  lockfile_backup_dir=$(mktemp -d "${TMPDIR:-/tmp}/terraform-aws-github-runner-migration-lock.XXXXXX")
  for phase in v1 v2; do
    target="$example_root/$phase/.terraform.lock.hcl"
    source="$example_root/$phase/$lockfile_name"
    if [ "$source" = "$target" ]; then
      continue
    fi
    if [ -f "$target" ]; then
      cp "$target" "$lockfile_backup_dir/$phase.lock"
      : > "$lockfile_backup_dir/$phase.exists"
    fi
    cp "$source" "$target"
  done
}

restore_lockfiles() {
  if [ -z "$lockfile_backup_dir" ]; then
    return
  fi
  for phase in v1 v2; do
    target="$example_root/$phase/.terraform.lock.hcl"
    source="$example_root/$phase/$lockfile_name"
    if [ "$source" = "$target" ]; then
      continue
    fi
    if [ -f "$lockfile_backup_dir/$phase.exists" ]; then
      cp "$lockfile_backup_dir/$phase.lock" "$target"
    else
      rm -f "$target"
    fi
  done
  rm -rf "$lockfile_backup_dir"
  lockfile_backup_dir=""
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

  create_ami_fixture migration-test-linux x86_64 >/dev/null
}

cleanup() {
  restore_lockfiles
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

iac_migration_init() {
  prepare_lockfiles
  "$iac_binary" -chdir="$example_root/v1" init -reconfigure -input=false
  "$iac_binary" -chdir="$example_root/v2" init -reconfigure -input=false
}

iac_migration_example() {
  phase="$1"
  shift
  phase_root="$example_root/$phase"
  "$iac_binary" -chdir="$phase_root" "$@" -var-file="$phase_root/$phase.tfvars"
}

snapshot_migration_iam_policies() {
  python3 "$example_root/compare_iam_role_policies.py" snapshot "$1"
}

compare_migration_iam_policies() {
  python3 "$example_root/compare_iam_role_policies.py" compare "$1" "$2"
}

assert_migration_plan_has_no_infrastructure_changes() {
  phase="$1"
  phase_root="$example_root/$phase"
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

  if "$iac_binary" -chdir="$phase_root" show -json "$plan_file" |
    python3 -c '
import json
import sys

unexpected = []
ignored_resource_types = {
    "aws_cloudwatch_log_group",
    "aws_iam_role_policy",
    "aws_launch_template",
    "aws_security_group",
    "aws_ssm_parameter",
}
ignored_resource_address_fragments = {
    ".aws_launch_template.",
    ".aws_security_group.",
    ".aws_sqs_queue_policy.job_retry_check_queue_policy",
}
ignored_tag_only_resource_address_suffixes = {
    ".aws_lambda_event_source_mapping.job_retry",
}
ignored_assume_role_sid_resource_address_suffixes = {
    ".aws_iam_role.job_retry",
}
ignored_tag_keys = {"Name", "ghr:ssm_config_path"}

def without_ignored_attributes(value, resource_type, resource_address=""):
    if not isinstance(value, dict):
        return value

    normalized = dict(value)
    ignored_attributes = {"tags", "tags_all"}
    ignore_all_tags = any(
        resource_address.endswith(suffix)
        for suffix in ignored_tag_only_resource_address_suffixes
    )
    if (
        resource_type == "aws_lambda_function"
        or ".aws_lambda_function." in resource_address
    ):
        ignored_attributes.update({"filename", "last_modified", "layers"})

    for attribute in ignored_attributes:
        attribute_value = normalized.get(attribute)
        if attribute in {"tags", "tags_all"} and isinstance(attribute_value, dict):
            if ignore_all_tags:
                normalized.pop(attribute)
            else:
                normalized[attribute] = {
                    key: tag_value
                    for key, tag_value in attribute_value.items()
                    if key not in ignored_tag_keys
                }
        elif attribute in normalized:
            normalized.pop(attribute)

    if resource_type == "aws_iam_role" or any(
        resource_address.endswith(suffix)
        for suffix in ignored_assume_role_sid_resource_address_suffixes
    ):
        assume_role_policy = normalized.get("assume_role_policy")
        if isinstance(assume_role_policy, str):
            try:
                policy = json.loads(assume_role_policy)
            except json.JSONDecodeError:
                policy = None

            if isinstance(policy, dict):
                statements = policy.get("Statement")
                if isinstance(statements, dict):
                    statements = [statements]
                if isinstance(statements, list):
                    normalized_statements = []
                    for statement in statements:
                        if isinstance(statement, dict):
                            statement = dict(statement)
                            statement.pop("Sid", None)
                        normalized_statements.append(statement)
                    policy = dict(policy)
                    policy["Statement"] = normalized_statements
                    normalized["assume_role_policy"] = json.dumps(
                        policy, sort_keys=True, separators=(",", ":")
                    )
    return normalized

for resource in json.load(sys.stdin).get("resource_changes", []):
    address = resource.get("address", "")
    if resource.get("mode") != "managed" or resource.get("type") == "terraform_data":
        continue
    if not address.startswith("module.runners."):
        continue
    if (
        resource.get("type") in ignored_resource_types
        or any(fragment in address for fragment in ignored_resource_address_fragments)
    ):
        continue
    actions = resource.get("change", {}).get("actions", [])
    if actions == ["update"]:
        change = resource["change"]
        resource_type = resource.get("type")
        if (
            without_ignored_attributes(change.get("before"), resource_type, address)
            == without_ignored_attributes(change.get("after"), resource_type, address)
        ):
            continue
    if actions != ["no-op"]:
        resource_address = resource.get("address", "<unknown>")
        action_text = ",".join(actions)
        unexpected.append(f"{resource_address}: {action_text}")

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

trap cleanup EXIT INT TERM

case "$action" in
  init)
    iac_migration_init
    ;;
  plan)
    create_ministack_fixtures
    iac_migration_init
    iac_migration_example v1 plan -input=false
    ;;
  apply)
    create_ministack_fixtures
    run_migration_test
    ;;
  destroy)
    create_ministack_fixtures
    iac_migration_init
    iac_migration_example v2 destroy -auto-approve -input=false
    ;;
esac
