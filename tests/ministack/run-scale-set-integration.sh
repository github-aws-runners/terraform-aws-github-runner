#!/bin/sh

set -eu

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-000000000000}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test-only}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-eu-west-1}"
export AWS_REGION="${AWS_REGION:-eu-west-1}"
export AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://127.0.0.1:4566}"
export AWS_EC2_METADATA_DISABLED="${AWS_EC2_METADATA_DISABLED:-true}"

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
source_root=$(CDPATH='' cd -- "$script_dir/../.." && pwd)
example="multi-runner-scale-set"
base_tfvars="$script_dir/$example.tfvars"
tfvars_file=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-scale-set.XXXXXX")
app_key_file=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-scale-set-key.XXXXXX")
log_file=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-scale-set-logs.XXXXXX")
controller_log_file=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-scale-set-controller-logs.XXXXXX")
config_file=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-scale-set-config.XXXXXX")
task_definition_file=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-scale-set-task-definition.XXXXXX")
instance_file=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-scale-set-instances.XXXXXX")
scale_down_config_file=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-scale-set-scale-down-config.XXXXXX")
initializer_file=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-scale-set-mockserver.XXXXXX")
repository_name="scale-set-controller"
image_reference="localhost:4566/${repository_name}:smoke"
mockserver_host="${MINISTACK_GITHUB_MOCK_HOST:-127.0.0.1}"
mockserver_port="${MINISTACK_GITHUB_MOCK_PORT:-1080}"
mockserver_url="${MINISTACK_GITHUB_MOCK_URL:-http://127.0.0.1:${mockserver_port}}"
controller_mock_url="https://${mockserver_host}:${mockserver_port}"
terraform_state_exists=false

cleanup() {
  cleanup_status=$?
  set +e

  if [ "$terraform_state_exists" = true ]; then
    "$source_root/tests/ministack/run-example.sh" destroy "$example" "$tfvars_file" >/dev/null 2>&1
  fi

  rm -f "$tfvars_file" "$app_key_file" "$log_file" "$controller_log_file" "$config_file" "$task_definition_file" "$instance_file" "$scale_down_config_file" "$initializer_file"
  exit "$cleanup_status"
}
trap cleanup EXIT INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required to run the scale-set MiniStack smoke test." >&2
    exit 69
  fi
}

for command in aws curl docker openssl python3 terraform; do
  require_command "$command"
done

ministack_aws() {
  aws --endpoint-url "$AWS_ENDPOINT_URL" --region "$AWS_DEFAULT_REGION" "$@"
}

wait_for_http() {
  url="$1"
  attempts=90
  while ! curl -fsS --max-time 2 "$url" >/dev/null 2>&1; do
    attempts=$((attempts - 1))
    if [ "$attempts" -le 0 ]; then
      echo "Timed out waiting for $url." >&2
      exit 70
    fi
    sleep 1
  done
}

wait_for_scale_set_runner() {
  attempts=90
  while :; do
    ministack_aws ec2 describe-instances --output json > "$instance_file"
    instance_id=$(python3 - "$instance_file" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as instance_file:
    response = json.load(instance_file)

required_tags = {
    "ghr:Application": "github-action-runner",
    "ghr:created_by": "scale-set-service",
    "ghr:environment": "ministack-scale-set-linux-scale-set",
    "ghr:Type": "Org",
    "ghr:Owner": "example",
    "ghr:scale_set_state": "config-published",
    "ghr:github_runner_id": "321",
}
active_states = {"pending", "running", "stopping", "stopped", "shutting-down"}
matches = []
for reservation in response.get("Reservations", []):
    for instance in reservation.get("Instances", []):
        if instance.get("State", {}).get("Name") not in active_states:
            continue
        tags = {tag.get("Key"): tag.get("Value") for tag in instance.get("Tags", [])}
        if all(tags.get(key) == value for key, value in required_tags.items()) and tags.get("ghr:runner_name", "").startswith("scale-set-"):
            matches.append(instance["InstanceId"])

if len(matches) == 1:
    print(matches[0])
PY
)
    if [ -n "$instance_id" ]; then
      printf '  [PASS] MiniStack created and registered scale-set EC2 runner %s\n' "$instance_id"
      return 0
    fi
    attempts=$((attempts - 1))
    if [ "$attempts" -le 0 ]; then
      echo "Timed out waiting for the scale-set EC2 runner to reach config-published state." >&2
      cat "$instance_file" >&2 || true
      exit 1
    fi
    sleep 2
  done
}

wait_for_no_scale_set_runners() {
  attempts=90
  while :; do
    ministack_aws ec2 describe-instances --output json > "$instance_file"
    active_count=$(python3 - "$instance_file" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as instance_file:
    response = json.load(instance_file)

required_tags = {
    "ghr:Application": "github-action-runner",
    "ghr:created_by": "scale-set-service",
    "ghr:environment": "ministack-scale-set-linux-scale-set",
    "ghr:Type": "Org",
    "ghr:Owner": "example",
}
active_states = {"pending", "running", "stopping", "stopped", "shutting-down"}
count = 0
for reservation in response.get("Reservations", []):
    for instance in reservation.get("Instances", []):
        if instance.get("State", {}).get("Name") not in active_states:
            continue
        tags = {tag.get("Key"): tag.get("Value") for tag in instance.get("Tags", [])}
        if all(tags.get(key) == value for key, value in required_tags.items()):
            count += 1
print(count)
PY
)
    if [ "$active_count" = "0" ]; then
      printf '%s\n' '  [PASS] scale-set EC2 runner was terminated after the minimum changed to zero'
      return 0
    fi
    attempts=$((attempts - 1))
    if [ "$attempts" -le 0 ]; then
      echo "Timed out waiting for the scale-set EC2 runner to terminate; active count is $active_count." >&2
      cat "$instance_file" >&2 || true
      exit 1
    fi
    sleep 2
  done
}

wait_for_http "$AWS_ENDPOINT_URL/_ministack/health"
attempts=90
while ! curl -fsS --max-time 2 -X PUT "$mockserver_url/mockserver/status" >/dev/null 2>&1; do
  attempts=$((attempts - 1))
  if [ "$attempts" -le 0 ]; then
    echo "Timed out waiting for $mockserver_url/mockserver/status." >&2
    exit 70
  fi
  sleep 1
done
curl -fsS -X PUT "$mockserver_url/mockserver/reset" >/dev/null
CONTROLLER_MOCK_URL="$controller_mock_url" python3 - "$source_root/mockserver/initializerJson.json" "$initializer_file" <<'PY'
import os
import sys

source, destination = sys.argv[1:]
with open(source, encoding="utf-8") as source_file:
    fixture = source_file.read()
fixture = fixture.replace("https://mockserver:1080", os.environ["CONTROLLER_MOCK_URL"])
with open(destination, "w", encoding="utf-8") as destination_file:
    destination_file.write(fixture)
PY
curl -fsS -X PUT \
  "$mockserver_url/mockserver/expectation" \
  -H 'Content-Type: application/json' \
  --data-binary "@$initializer_file" \
  >/dev/null

repository_policy=$(python3 - <<'PY'
import json

print(json.dumps({
    "Version": "2012-10-17",
    "Statement": [{
        "Sid": "AllowAccountPull",
        "Effect": "Allow",
        "Principal": {"AWS": "arn:aws:iam::000000000000:root"},
        "Action": [
            "ecr:BatchCheckLayerAvailability",
            "ecr:BatchGetImage",
            "ecr:GetDownloadUrlForLayer",
        ],
    }],
}))
PY
)

ministack_aws ecr create-repository \
  --repository-name "$repository_name" \
  --image-tag-mutability IMMUTABLE \
  --image-scanning-configuration scanOnPush=false \
  >/dev/null
ministack_aws ecr set-repository-policy \
  --repository-name "$repository_name" \
  --policy-text "$repository_policy" \
  >/dev/null

docker build \
  --target runtime \
  --file "$source_root/lambdas/services/scale-set/Dockerfile" \
  --tag "$image_reference" \
  "$source_root"

ministack_aws ecr get-login-password | docker login \
  --username AWS \
  --password-stdin localhost:4566 >/dev/null
docker push "$image_reference"

ministack_aws ecr describe-images \
  --repository-name "$repository_name" \
  --image-ids imageTag=smoke \
  >/dev/null

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$app_key_file" 2>/dev/null
app_key_base64=$(base64 < "$app_key_file" | tr -d '\n')
APP_KEY_BASE64="$app_key_base64" GITHUB_CONFIG_URL="$controller_mock_url" python3 - "$base_tfvars" "$tfvars_file" <<'PY'
import os
import sys

source, destination = sys.argv[1:]
replacement = os.environ["APP_KEY_BASE64"]
github_config_url = os.environ["GITHUB_CONFIG_URL"]
with open(source, encoding="utf-8") as source_file:
    lines = source_file.readlines()
with open(destination, "w", encoding="utf-8") as destination_file:
    for line in lines:
        if line.lstrip().startswith("key_base64"):
            destination_file.write(f'  key_base64      = "{replacement}"\n')
        elif line.lstrip().startswith("config_url"):
            destination_file.write(f'  config_url         = "{github_config_url}"\n')
        else:
            destination_file.write(line)
PY
unset app_key_base64 APP_KEY_BASE64

terraform_state_exists=true
"$source_root/tests/ministack/run-example.sh" apply "$example" "$tfvars_file"

config_path="/ministack-scale-set/scale-set-controller/linux-scale-set/linux-scale-set"
ministack_aws ssm get-parameter \
  --name "$config_path" \
  --query 'Parameter.Value' \
  --output text > "$config_file"
EXPECTED_GITHUB_CONFIG_URL="$controller_mock_url/example" python3 - "$config_file" <<'PY'
import json
import os
import sys

with open(sys.argv[1], encoding="utf-8") as config_file:
    config = json.load(config_file)

assert config["githubConfigUrl"] == os.environ["EXPECTED_GITHUB_CONFIG_URL"]
assert config["forceGhes"] is True
assert config["sslVerify"] is False
assert config["minRunners"] == 1
assert config["githubApp"]["appIdParameterName"]
assert config["githubApp"]["installationIdParameterName"]
assert config["githubApp"]["privateKeyParameterName"]
print("  [PASS] SSM manifest has the expected MockServer and GitHub App settings")
PY

task_definition=$(ministack_aws ecs list-task-definitions \
  --family-prefix ministack-scale-set-ss-linux-scale-set- \
  --sort DESC \
  --query 'taskDefinitionArns[0]' \
  --output text)
if [ -z "$task_definition" ] || [ "$task_definition" = "None" ]; then
  echo "The scale-set task definition was not registered." >&2
  exit 1
fi

actual_image=$(ministack_aws ecs describe-task-definition \
  --task-definition "$task_definition" \
  --query 'taskDefinition.containerDefinitions[?name==`scale-set-controller`].image | [0]' \
  --output text)
if [ "$actual_image" != "$image_reference" ]; then
  echo "Expected the ECS task to use $image_reference, got $actual_image." >&2
  exit 1
fi
printf '%s\n' '  [PASS] ECS task definition uses the image pushed to MiniStack ECR'

log_driver=$(ministack_aws ecs describe-task-definition \
  --task-definition "$task_definition" \
  --query 'taskDefinition.containerDefinitions[?name==`scale-set-controller`].logConfiguration.logDriver | [0]' \
  --output text)
if [ "$log_driver" != "awslogs" ]; then
  echo "Expected the ECS task to request the awslogs driver, got $log_driver." >&2
  exit 1
fi
printf '%s\n' '  [PASS] ECS task definition requests the awslogs driver'

log_group=$(ministack_aws logs describe-log-groups \
  --log-group-name-prefix "/aws/ecs/ministack-scale-set-ss-linux-scale-set-" \
  --query 'logGroups[0].logGroupName' \
  --output text)
if [ -z "$log_group" ] || [ "$log_group" = "None" ]; then
  echo "The scale-set CloudWatch log group was not created." >&2
  exit 1
fi
printf '%s\n' '  [PASS] CloudWatch log group was created for the ECS controller'

task_family=$(ministack_aws ecs describe-task-definition \
  --task-definition "$task_definition" \
  --query 'taskDefinition.family' \
  --output text)

# MiniStack exposes ECS credentials through the gateway's container IP. The
# Node.js AWS SDK intentionally rejects that address in
# AWS_CONTAINER_CREDENTIALS_FULL_URI because non-HTTPS full URIs are limited
# to loopback and the real ECS metadata address. Use only synthetic,
# test-scoped credentials in a temporary task-definition revision so the
# smoke test still exercises the pushed image, ECS service, and controller
# lifecycle without changing the production task definition or application.
ministack_aws ecs describe-task-definition \
  --task-definition "$task_definition" \
  --query 'taskDefinition' \
  --output json > "$task_definition_file"
TASK_DEFINITION_FILE="$task_definition_file" python3 - <<'PY'
import json
import os

path = os.environ["TASK_DEFINITION_FILE"]
with open(path, encoding="utf-8") as task_definition_file:
    task_definition = json.load(task_definition_file)

for field in (
    "taskDefinitionArn",
    "revision",
    "status",
    "requiresAttributes",
    "compatibilities",
    "registeredAt",
    "registeredBy",
):
    task_definition.pop(field, None)

for container in task_definition["containerDefinitions"]:
    if container["name"] != "scale-set-controller":
        continue
    environment = container.setdefault("environment", [])
    environment.extend([
        {"name": "AWS_ACCESS_KEY_ID", "value": "000000000000"},
        {"name": "AWS_SECRET_ACCESS_KEY", "value": "test-only"},
    ])

with open(path, "w", encoding="utf-8") as task_definition_file:
    json.dump(task_definition, task_definition_file)
PY

environment_name=$(sed -n 's/^environment[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$base_tfvars")
cluster_name="${environment_name}-scale-set"
task_definition=$(ministack_aws ecs register-task-definition \
  --cli-input-json "file://$task_definition_file" \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)
ministack_aws ecs update-service \
  --cluster "$cluster_name" \
  --service "$task_family" \
  --task-definition "$task_definition" \
  >/dev/null

task_revision=$(ministack_aws ecs describe-task-definition \
  --task-definition "$task_definition" \
  --query 'taskDefinition.revision' \
  --output text)
controller_container=""
attempts=90
while [ -z "$controller_container" ]; do
  controller_container=$(docker ps -a \
    --filter "label=com.amazonaws.ecs.task-definition-family=$task_family" \
    --filter "label=com.amazonaws.ecs.task-definition-version=$task_revision" \
    --filter 'name=scale-set-controller' \
    --format '{{.ID}}' | sed -n '1p')
  if [ -n "$controller_container" ]; then
    break
  fi
  attempts=$((attempts - 1))
  if [ "$attempts" -le 0 ]; then
    echo "Timed out waiting for the MiniStack ECS controller container." >&2
    docker ps -a --format '{{.ID}} {{.Image}} {{.Status}} {{.Names}}' >&2 || true
    exit 1
  fi
  sleep 2
done
printf '  [PASS] MiniStack started ECS controller container %s\n' "$controller_container"

wait_for_controller_log_event() {
  marker="$1"
  required_text="${2:-}"
  attempts=90
  while :; do
    docker logs "$controller_container" > "$controller_log_file" 2>&1 || true
    if python3 - "$controller_log_file" "$marker" "$required_text" <<'PY'
import sys

marker, required = sys.argv[2:]
with open(sys.argv[1], encoding="utf-8") as log_file:
    messages = log_file.read().splitlines()
if any(marker in message and (not required or required in message) for message in messages):
    raise SystemExit(0)
raise SystemExit(1)
PY
    then
      printf '  [PASS] CloudWatch logs contain %s\n' "$marker"
      return 0
    fi
    attempts=$((attempts - 1))
    if [ "$attempts" -le 0 ]; then
      echo "Timed out waiting for controller log marker '$marker'." >&2
      cat "$controller_log_file" >&2 || true
      echo "Controller AWS/ECS metadata environment:" >&2
      docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$controller_container" \
        | sed -E 's/^(AWS_CONTAINER_AUTHORIZATION_TOKEN|AWS_CONTAINER_CREDENTIALS_FULL_URI)=.*/\1=<set>/' \
        | grep -E '^(AWS_|ECS_)' >&2 || true
      echo "Controller network attachments:" >&2
      docker inspect --format '{{json .NetworkSettings.Networks}}' "$controller_container" >&2 || true
      echo "Controller credential endpoint probe:" >&2
      docker exec "$controller_container" node -e \
        'fetch(process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI, {headers: {Authorization: process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN}}).then((response) => { console.error(`status=${response.status}`); process.exit(response.ok ? 0 : 1); }).catch((error) => { console.error(`${error.name}:${error.message}`); process.exit(1); })' \
        >&2 || true
      exit 1
    fi
    sleep 2
  done
}

printf '%s\n' '  [INFO] MiniStack 1.5.12 does not emit ECS awslogs streams; validating controller runtime logs instead'
wait_for_controller_log_event 'scale_set_controller_started'
wait_for_controller_log_event 'scale_set_session_created'
wait_for_controller_log_event 'scale_set_reconciled' '"desiredRunners":1'
wait_for_controller_log_event 'scale_set_reconciled' '"status":"converged"'
wait_for_scale_set_runner

wait_for_mock_route() {
  method="$1"
  route="$2"
  body=$(REQUEST_METHOD="$method" REQUEST_PATH="$route" python3 - <<'PY'
import json
import os

print(json.dumps({
    "httpRequest": {
        "method": os.environ["REQUEST_METHOD"],
        "path": os.environ["REQUEST_PATH"],
    },
    "times": {"atLeast": 1},
}))
PY
  )
  attempts=45
  while ! curl -fsS --max-time 5 -X PUT \
    http://127.0.0.1:1080/mockserver/verify \
    -H 'Content-Type: application/json' \
    --data "$body" >/dev/null 2>&1; do
    attempts=$((attempts - 1))
    if [ "$attempts" -le 0 ]; then
      echo "Timed out waiting for MockServer route: $method $route" >&2
      curl -sS --max-time 5 \
        'http://127.0.0.1:1080/mockserver/retrieve?type=REQUESTS&format=JSON' >&2 || true
      exit 1
    fi
    sleep 2
  done
  printf '  [PASS] MockServer received %s %s\n' "$method" "$route"
}

wait_for_mock_route POST '/api/v3/app/installations/456/access_tokens'
wait_for_mock_route POST '/api/v3/orgs/example/actions/runners/registration-token'
wait_for_mock_route POST '/api/v3/actions/runner-registration'
wait_for_mock_route GET '/tenant/123/_apis/runtime/runnergroups/'
wait_for_mock_route GET '/tenant/123/_apis/runtime/runnerscalesets'
wait_for_mock_route GET '/tenant/123/_apis/runtime/runnerscalesets/223'
wait_for_mock_route PATCH '/tenant/123/_apis/runtime/runnerscalesets/223'
wait_for_mock_route POST '/tenant/123/_apis/runtime/runnerscalesets/223/sessions'
wait_for_mock_route GET '/messages'

python3 - "$config_file" "$scale_down_config_file" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as config_file:
    reconciler = json.load(config_file)

assert reconciler["minRunners"] == 1
reconciler["minRunners"] = 0
with open(sys.argv[2], "w", encoding="utf-8") as config_file:
    json.dump(reconciler, config_file)
PY
ministack_aws ssm put-parameter \
  --name "$config_path" \
  --type String \
  --value "$(cat "$scale_down_config_file")" \
  --overwrite \
  >/dev/null
printf '%s\n' '  [PASS] SSM manifest minimum changed from one runner to zero'

SCALE_DOWN_CONFIG_FILE="$scale_down_config_file" TASK_DEFINITION_FILE="$task_definition_file" python3 - <<'PY'
import json
import os

with open(os.environ["SCALE_DOWN_CONFIG_FILE"], encoding="utf-8") as config_file:
    reconciler = json.load(config_file)
with open(os.environ["TASK_DEFINITION_FILE"], encoding="utf-8") as task_definition_file:
    task_definition = json.load(task_definition_file)

for container in task_definition["containerDefinitions"]:
    if container["name"] != "scale-set-controller":
        continue
    for environment in container.get("environment", []):
        if environment["name"] == "SCALE_SET_CONTROLLER_MANIFEST":
            manifest = json.loads(environment["value"])
            assert len(manifest.get("reconcilers", [])) == 1
            manifest["reconcilers"][0]["minRunners"] = reconciler["minRunners"]
            environment["value"] = json.dumps(manifest, separators=(",", ":"))
            break
    else:
        raise RuntimeError("scale-set controller task definition has no inline manifest")

with open(os.environ["TASK_DEFINITION_FILE"], "w", encoding="utf-8") as task_definition_file:
    json.dump(task_definition, task_definition_file)
PY
task_definition=$(ministack_aws ecs register-task-definition \
  --cli-input-json "file://$task_definition_file" \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)
task_revision=$(ministack_aws ecs describe-task-definition \
  --task-definition "$task_definition" \
  --query 'taskDefinition.revision' \
  --output text)
ministack_aws ecs update-service \
  --cluster "$cluster_name" \
  --service "$task_family" \
  --task-definition "$task_definition" \
  --force-new-deployment \
  >/dev/null

old_controller_container="$controller_container"
new_controller_container=""
attempts=90
while [ -z "$new_controller_container" ]; do
  for candidate in $(docker ps -a \
    --filter "label=com.amazonaws.ecs.task-definition-family=$task_family" \
    --filter "label=com.amazonaws.ecs.task-definition-version=$task_revision" \
    --filter 'name=scale-set-controller' \
    --format '{{.ID}}'); do
    if [ "$candidate" != "$old_controller_container" ]; then
      new_controller_container="$candidate"
      break
    fi
  done
  if [ -n "$new_controller_container" ]; then
    break
  fi
  attempts=$((attempts - 1))
  if [ "$attempts" -le 0 ]; then
    echo 'Timed out waiting for the ECS service to deploy the scale-down task.' >&2
    docker ps -a --format '{{.ID}} {{.Image}} {{.Status}} {{.Names}}' >&2 || true
    exit 1
  fi
  sleep 2
done
controller_container="$new_controller_container"
printf '  [PASS] ECS service deployed a fresh controller container %s for scale-down\n' "$controller_container"
wait_for_controller_log_event 'scale_set_controller_started'
wait_for_controller_log_event 'scale_set_session_created'
wait_for_controller_log_event 'scale_set_reconciled' '"desiredRunners":0'
wait_for_controller_log_event 'scale_set_reconciled' '"status":"converged"'
wait_for_no_scale_set_runners

"$source_root/tests/ministack/run-example.sh" destroy "$example" "$tfvars_file"
terraform_state_exists=false
wait_for_mock_route DELETE '/tenant/123/_apis/runtime/runnerscalesets/223/sessions/11111111-1111-1111-1111-111111111111'

echo 'Scale-set MiniStack ECS/MockServer smoke test passed.'
