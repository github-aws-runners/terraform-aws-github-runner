#!/bin/sh

set -eu

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-000000000000}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test-only}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-eu-west-1}"
export AWS_REGION="${AWS_REGION:-eu-west-1}"
export AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://localhost:4566}"
export AWS_EC2_METADATA_DISABLED="${AWS_EC2_METADATA_DISABLED:-true}"

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
source_root=$(CDPATH='' cd -- "$script_dir/../.." && pwd)
example="multi-runner-scale-set"
tfvars_file="$script_dir/$example.tfvars"
cluster_name="ministack-scale-set-scale-set"
controller_group="linux-scale-set"
config_path="/ministack-scale-set/scale-set-controller/$controller_group"
expected_parameter_name="$config_path/linux-scale-set"
service_file=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-scale-set-service.XXXXXX")
task_file=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-scale-set-task.XXXXXX")
terraform_state_exists=false

cleanup() {
  set +e
  if [ "$terraform_state_exists" = true ]; then
    "$source_root/tests/ministack/run-example.sh" destroy "$example" "$tfvars_file" >/dev/null 2>&1
  fi
  rm -f "$service_file" "$task_file"
}
trap cleanup EXIT INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required to run the scale-set MiniStack integration test." >&2
    exit 69
  fi
}

for command in aws curl python3 terraform; do
  require_command "$command"
done

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

assert_equal() {
  expected="$1"
  actual="$2"
  description="$3"

  if [ "$actual" != "$expected" ]; then
    echo "Expected $description to be '$expected', got '$actual'." >&2
    exit 1
  fi
  printf '  [PASS] %s\n' "$description"
}

assert_non_empty() {
  value="$1"
  description="$2"

  if [ -z "$value" ] || [ "$value" = "None" ]; then
    echo "Expected $description to be non-empty." >&2
    exit 1
  fi
  printf '  [PASS] %s\n' "$description"
}

wait_for_ministack

terraform_state_exists=true
"$source_root/tests/ministack/run-example.sh" apply "$example" "$tfvars_file"

cluster_status=$(ministack_aws ecs describe-clusters \
  --clusters "$cluster_name" \
  --query 'clusters[0].status' \
  --output text)
assert_equal ACTIVE "$cluster_status" "the scale-set ECS cluster is active"

service_count=$(ministack_aws ecs list-services \
  --cluster "$cluster_name" \
  --query 'length(serviceArns)' \
  --output text)
assert_equal 1 "$service_count" "the scale-set controller service count"

service_arn=$(ministack_aws ecs list-services \
  --cluster "$cluster_name" \
  --query 'serviceArns[0]' \
  --output text)
assert_non_empty "$service_arn" "the scale-set controller service ARN"

ministack_aws ecs describe-services \
  --cluster "$cluster_name" \
  --services "$service_arn" \
  --output json > "$service_file"

task_definition=$(python3 - "$service_file" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as service_file:
    service = json.load(service_file)["services"][0]

assert service["status"] == "ACTIVE"
assert service["desiredCount"] == 1
assert service["launchType"] == "FARGATE"
assert service["deploymentController"]["type"] == "ECS"
assert service["enableExecuteCommand"] is False
assert service["networkConfiguration"]["awsvpcConfiguration"]["assignPublicIp"] == "DISABLED"
assert len(service["networkConfiguration"]["awsvpcConfiguration"]["securityGroups"]) == 1
print(service["taskDefinition"])
PY
)
assert_non_empty "$task_definition" "the scale-set controller task definition ARN"
printf '  [PASS] the scale-set controller service uses one hardened Fargate task\n'

ministack_aws ecs describe-task-definition \
  --task-definition "$task_definition" \
  --output json > "$task_file"

python3 - "$task_file" "$config_path" <<'PY'
import json
import sys

task_path = sys.argv[2]
with open(sys.argv[1], encoding="utf-8") as task_file:
    task_definition = json.load(task_file)["taskDefinition"]

assert task_definition["family"].startswith("ministack-scale-set-ss-linux-scale-set-")
container = next(
    container
    for container in task_definition["containerDefinitions"]
    if container["name"] == "scale-set-controller"
)
assert container["image"].startswith(
    "ghcr.io/github-aws-runners/terraform-aws-github-runner-scale-set-service:"
)
assert container["user"] == "10001:10001"
assert container["privileged"] is False
assert container["readonlyRootFilesystem"] is True
assert container["linuxParameters"]["capabilities"]["drop"] == ["ALL"]

environment = {entry["name"]: entry["value"] for entry in container["environment"]}
assert environment["SCALE_SET_CONTROLLER_GROUP_NAME"] == "linux-scale-set"
assert environment["SCALE_SET_CONTROLLER_GROUP_CONFIG_PATH"] == task_path
assert environment["SCALE_SET_CONTROLLER_GROUP_CONFIG_REVISION"]
print("  [PASS] the scale-set task definition contains the controller contract and hardening")
PY

parameter_count=$(ministack_aws ssm get-parameters-by-path \
  --path "$config_path" \
  --query 'length(Parameters)' \
  --output text)
assert_equal 1 "$parameter_count" "the scale-set reconciler parameter count"

parameter_name=$(ministack_aws ssm get-parameters-by-path \
  --path "$config_path" \
  --query 'Parameters[0].Name' \
  --output text)
assert_equal "$expected_parameter_name" "$parameter_name" "the scale-set reconciler parameter path"

echo "Scale-set MiniStack integration test passed."
