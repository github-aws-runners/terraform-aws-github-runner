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
example_root="$source_root/examples/microvm"
mock_expectations="$script_dir/github-api-expectations.json"
fixture=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-microvm-workflow-job.XXXXXX")
mock_host="${MINISTACK_GITHUB_MOCK_HOST:-host.docker.internal}"
mock_port="${MINISTACK_GITHUB_MOCK_PORT:-}"
mock_service_url="${MINISTACK_GITHUB_MOCK_URL:-}"
mock_image="${MINISTACK_GITHUB_MOCK_IMAGE:-mockserver/mockserver:7.6.0@sha256:80b3b1a26f3553d0c81a3f3896b5b7274c17b2a2e52f0fd2b28e246bc9efa290}"
mock_container=""
tfvars_source="$script_dir/microvm.tfvars"
tfvars_file=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-microvm-smoke.XXXXXX")
response_file=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-microvm-smoke-response.XXXXXX")
lambda_response_file=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-microvm-lambda-response.XXXXXX")
terraform_initialized=false
before_microvm_ids=""
discovered_microvm_ids=""
override_file="$example_root/zz_ministack_microvm_smoke_override.tf"
metadata_ssm_path="/github-action-runners/microvm-ministack/microvm/runners/config/microvm-metadata"
runner_token_ssm_path="/github-action-runners/microvm-ministack/microvm/runners/tokens"

cleanup() {
  set +e
  for microvm_id in $discovered_microvm_ids; do
    aws --endpoint-url "$AWS_ENDPOINT_URL" lambda-microvms terminate-microvm \
      --microvm-identifier "$microvm_id" >/dev/null 2>&1
  done
  if [ "$terraform_initialized" = true ]; then
    "$source_root/tests/ministack/run-example.sh" destroy microvm "$tfvars_file" >/dev/null 2>&1
  fi
  if [ -n "$mock_container" ]; then
    docker rm -f "$mock_container" >/dev/null 2>&1
  fi
  rm -f "$fixture" "$response_file" "$lambda_response_file" "$override_file" "$tfvars_file"
}
trap cleanup EXIT INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required to run the MiniStack MicroVM smoke test." >&2
    exit 69
  fi
}

for command in aws curl grep openssl python3 terraform; do
  require_command "$command"
done
if [ -z "$mock_service_url" ]; then
  require_command docker
fi

for lambda_zip in \
  "$source_root/lambdas/functions/webhook/webhook.zip" \
  "$source_root/lambdas/functions/control-plane/runners.zip"; do
  if [ ! -f "$lambda_zip" ]; then
    echo "Missing $lambda_zip. Build the webhook and control-plane distributions first." >&2
    exit 66
  fi
done

if [ -z "$mock_port" ]; then
  if [ -n "$mock_service_url" ]; then
    mock_port=1080
  else
    mock_port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("", 0)); print(s.getsockname()[1]); s.close()')
  fi
fi

if [ -z "$mock_service_url" ]; then
  mock_container="terraform-aws-github-runner-microvm-github-api-mock-$$"
  mock_service_url="http://127.0.0.1:${mock_port}"
  docker run --detach --name "$mock_container" --publish "${mock_port}:1080" \
    --volume "$mock_expectations:/config/github-api-expectations.json:ro" \
    --env MOCKSERVER_INITIALIZATION_JSON_PATH=/config/github-api-expectations.json \
    "$mock_image" >/dev/null
fi

attempts=30
while ! curl -fsS --max-time 2 -X PUT "${mock_service_url}/mockserver/status" >/dev/null 2>&1; do
  attempts=$((attempts - 1))
  if [ "$attempts" -le 0 ]; then
    echo "MockServer did not become ready." >&2
    if [ -n "$mock_container" ]; then
      docker logs "$mock_container" >&2
    fi
    exit 70
  fi
  sleep 1
done

if [ -z "$mock_container" ]; then
  MOCKSERVER_URL="$mock_service_url" python3 - "$mock_expectations" <<'PY'
import json
import os
import sys
import urllib.request

with open(sys.argv[1], encoding="utf-8") as expectations_file:
    expectations = json.load(expectations_file)

for expectation in expectations:
    request = urllib.request.Request(
        f'{os.environ["MOCKSERVER_URL"]}/mockserver/expectation',
        data=json.dumps(expectation).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        if response.status not in (200, 201):
            raise RuntimeError(f"MockServer expectation rejected with HTTP {response.status}")
PY
fi

MOCKSERVER_URL="$mock_service_url" python3 - <<'PY'
import json
import os
import urllib.request

path = "/api/v3/orgs/test-owner/actions/runners/generate-jitconfig"
expectation = {
    "httpRequest": {"method": "POST", "path": path},
    "httpResponse": {
        "statusCode": 200,
        "headers": {"Content-Type": ["application/json"]},
        "body": json.dumps(
            {
                "runner": {
                    "id": 987654321,
                    "labels": [
                        {"name": "self-hosted"},
                        {"name": "linux"},
                        {"name": "arm64"},
                        {"name": "microvm"},
                    ],
                },
                "encoded_jit_config": "ministack-microvm-jit-config",
            }
        ),
    },
}
request = urllib.request.Request(
    f'{os.environ["MOCKSERVER_URL"]}/mockserver/expectation',
    data=json.dumps(expectation).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="PUT",
)
with urllib.request.urlopen(request, timeout=10) as response:
    if response.status not in (200, 201):
        raise RuntimeError(f"MockServer JIT expectation rejected with HTTP {response.status}")
PY

MOCKSERVER_URL="$mock_service_url" python3 - <<'PY'
import json
import os
import urllib.request

path = "/api/v3/orgs/test-owner/actions/runner-groups"
expectation = {
    "httpRequest": {"method": "GET", "path": path},
    "httpResponse": {
        "statusCode": 200,
        "headers": {"Content-Type": ["application/json"]},
        "body": '[{"id":1,"name":"Default"}]',
    },
}
request = urllib.request.Request(
    f'{os.environ["MOCKSERVER_URL"]}/mockserver/expectation',
    data=json.dumps(expectation).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="PUT",
)
with urllib.request.urlopen(request, timeout=10) as response:
    if response.status not in (200, 201):
        raise RuntimeError(f"MockServer runner-group expectation rejected with HTTP {response.status}")
PY

python3 - "$script_dir/workflow_job_event.json" "$fixture" <<'PY'
import json
import sys

source, destination = sys.argv[1:]
with open(source, encoding="utf-8") as source_file:
    event = json.load(source_file)

job = event["workflow_job"]
job["labels"] = ["self-hosted", "linux", "arm64", "microvm"]
job["name"] = "ministack-microvm-smoke"

with open(destination, "w", encoding="utf-8") as destination_file:
    json.dump(event, destination_file)
PY

list_microvm_ids() {
  aws --endpoint-url "$AWS_ENDPOINT_URL" lambda-microvms list-microvms \
    --query 'items[].microvmId' --output text 2>/dev/null || true
}

id_in_list() {
  case " $1 " in
    *" $2 "*) return 0 ;;
  esac
  return 1
}

metadata_value() {
  parameter_name="$1"
  aws --endpoint-url "$AWS_ENDPOINT_URL" ssm get-parameter \
    --name "$parameter_name" --query 'Parameter.Value' --output text 2>/dev/null || true
}

json_field() {
  field="$1"
  python3 -c 'import json, sys; print(json.load(sys.stdin).get(sys.argv[1], ""))' "$field"
}

assert_metadata() {
  microvm_id="$1"
  source="$2"
  metadata=$(metadata_value "$metadata_ssm_path/$microvm_id")
  if [ -z "$metadata" ] || [ "$metadata" = "None" ]; then
    echo "Missing MicroVM ownership metadata for $microvm_id." >&2
    exit 1
  fi

  actual_id=$(printf '%s' "$metadata" | json_field microvmId)
  actual_environment=$(printf '%s' "$metadata" | json_field environment)
  actual_owner=$(printf '%s' "$metadata" | json_field runnerOwner)
  actual_type=$(printf '%s' "$metadata" | json_field runnerType)
  actual_source=$(printf '%s' "$metadata" | json_field source)
  if [ "$actual_id" != "$microvm_id" ] || [ "$actual_environment" != "microvm-ministack" ] \
    || [ "$actual_owner" != "test-owner" ] || [ "$actual_type" != "Org" ] || [ "$actual_source" != "$source" ]; then
    echo "Unexpected MicroVM ownership metadata for $microvm_id: $metadata" >&2
    exit 1
  fi

  tags=$(metadata_value "$metadata_ssm_path/$microvm_id.tags")
  if [ -z "$tags" ] || [ "$tags" = "None" ]; then
    echo "Missing MicroVM runner tag metadata for $microvm_id." >&2
    exit 1
  fi
  TAGS="$tags" EXPECTED_SOURCE="$source" python3 - <<'PY'
import json
import os

tags = json.loads(os.environ["TAGS"])
required = {
    "ghr:Application": "github-action-runner",
    "ghr:created_by": os.environ["EXPECTED_SOURCE"],
    "ghr:environment": "microvm-ministack",
    "ghr:Owner": "test-owner",
    "ghr:Type": "Org",
}
missing = [key for key, value in required.items() if tags.get(key) != value]
if missing:
    raise SystemExit(f"Missing or incorrect MicroVM runner tags: {missing}; got {tags}")
if not tags.get("ghr:microvm_id") or not tags.get("ghr:github_runner_id"):
    raise SystemExit(f"MicroVM runner tags do not contain runtime ownership fields: {tags}")
PY
}

assert_parameter_absent() {
  parameter_name="$1"
  description="$2"
  if aws --endpoint-url "$AWS_ENDPOINT_URL" ssm get-parameter \
    --name "$parameter_name" >/dev/null 2>&1; then
    echo "Expected SSM parameter to be deleted: $parameter_name" >&2
    exit 1
  fi
  printf '  [PASS] %s (%s is absent)\n' "$description" "$parameter_name"
}

wait_for_microvm() {
  expected_source="$1"
  description="$2"
  attempts=60
  while :; do
    for microvm_id in $(list_microvm_ids); do
      if [ "$microvm_id" = "None" ] || id_in_list "$before_microvm_ids" "$microvm_id"; then
        continue
      fi
      metadata=$(metadata_value "$metadata_ssm_path/$microvm_id")
      if [ -z "$metadata" ] || [ "$metadata" = "None" ]; then
        continue
      fi
      actual_source=$(printf '%s' "$metadata" | json_field source)
      if [ "$actual_source" != "$expected_source" ]; then
        continue
      fi
      discovered_microvm_ids="$discovered_microvm_ids $microvm_id"
      printf '  [PASS] MiniStack Lambda MicroVM API reports %s: %s\n' "$description" "$microvm_id"
      return
    done

    attempts=$((attempts - 1))
    if [ "$attempts" -le 0 ]; then
      echo "Timed out waiting for $description in the MiniStack Lambda MicroVM API." >&2
      aws --endpoint-url "$AWS_ENDPOINT_URL" lambda-microvms list-microvms --output json >&2 || true
      exit 1
    fi
    sleep 2
  done
}

assert_microvm_running() {
  microvm_id="$1"
  details=$(aws --endpoint-url "$AWS_ENDPOINT_URL" lambda-microvms get-microvm \
    --microvm-identifier "$microvm_id" --output json)
  state=$(printf '%s' "$details" | json_field state)
  image_arn=$(printf '%s' "$details" | json_field imageArn)
  case "$state" in
    PENDING | RUNNING | SUSPENDING | SUSPENDED) ;;
    *)
      echo "MicroVM $microvm_id did not reach an active state: $details" >&2
      exit 1
      ;;
  esac
  if [ "$image_arn" != "arn:aws:lambda:eu-west-1:000000000000:microvm-image:ministack" ]; then
    echo "MicroVM $microvm_id used an unexpected image: $details" >&2
    exit 1
  fi
  printf '  [PASS] MicroVM %s is active with the configured MicroVM image (%s)\n' "$microvm_id" "$state"
}

webhook_endpoint=""
send_webhook() {
  fixture_file="$1"
  delivery_id="$2"
  signature=$(openssl dgst -sha256 -hmac "$webhook_secret" "$fixture_file" | awk '{print $NF}')
  status_code=$(curl -sS --max-time 15 -o "$response_file" -w '%{http_code}' \
    --connect-to "${api_host}:4566:127.0.0.1:${endpoint_port}" \
    -X POST "$webhook_endpoint" \
    -H 'Content-Type: application/json' \
    -H 'X-GitHub-Event: workflow_job' \
    -H "X-GitHub-Delivery: ${delivery_id}" \
    -H 'X-GitHub-Hook-Installation-Target-ID: 123' \
    -H "X-Hub-Signature-256: sha256=${signature}" \
    --data-binary "@${fixture_file}")

  if [ "$status_code" != 201 ]; then
    echo "Webhook smoke request failed with HTTP $status_code." >&2
    sed -n '1,80p' "$response_file" >&2
    exit 1
  fi
  echo "  [PASS] API Gateway accepted the signed MicroVM workflow_job webhook ${delivery_id} (HTTP 201)"
}

wait_for_log_event() {
  log_group="$1"
  marker="$2"
  description="$3"
  attempts=60
  while ! aws --endpoint-url "$AWS_ENDPOINT_URL" logs filter-log-events \
    --log-group-name "$log_group" --filter-pattern "$marker" --limit 1 --output text 2>/dev/null | grep -Fq "$marker"; do
    attempts=$((attempts - 1))
    if [ "$attempts" -le 0 ]; then
      echo "Timed out waiting for MiniStack log marker '$marker' in $log_group." >&2
      exit 1
    fi
    sleep 2
  done
  printf '  [PASS] %s (log group %s contains %s)\n' "$description" "$log_group" "$marker"
}

wait_for_mock_route() {
  method="$1"
  route="$2"
  description="$3"
  verification_body=$(printf '{"httpRequest":{"method":"%s","path":"%s"},"times":{"atLeast":1}}' "$method" "$route")
  attempts=60
  while ! curl -fsS --max-time 5 -X PUT "${mock_service_url}/mockserver/verify" \
    -H 'Content-Type: application/json' \
    --data-binary "$verification_body" >/dev/null 2>&1; do
    attempts=$((attempts - 1))
    if [ "$attempts" -le 0 ]; then
      echo "Timed out waiting for MockServer route: $method $route" >&2
      curl -sS --max-time 5 -X PUT \
        "${mock_service_url}/mockserver/retrieve?type=REQUEST_RESPONSES&format=JSON" >&2 || true
      exit 1
    fi
    sleep 2
  done
  printf '  [PASS] %s (MockServer verified %s %s)\n' "$description" "$method" "$route"
}

clear_mock_request_log() {
  if ! curl -fsS --max-time 5 -X PUT \
    "${mock_service_url}/mockserver/clear?type=log" >/dev/null 2>&1; then
    echo "Failed to clear MockServer request history before the next lifecycle phase." >&2
    exit 1
  fi
}

assert_scale_up_github_routes() {
  wait_for_mock_route POST "/api/v3/app/installations/123/access_tokens" \
    "Scale-up requested a GitHub App installation token"
  wait_for_mock_route GET "/api/v3/repos/test-owner/test-repo/actions/jobs/123456" \
    "Scale-up checked the queued GitHub job 123456"
  wait_for_mock_route GET "/api/v3/orgs/test-owner/actions/runner-groups" \
    "Scale-up resolved the Default GitHub runner group"
  wait_for_mock_route POST "/api/v3/orgs/test-owner/actions/runners/generate-jitconfig" \
    "Scale-up generated the MicroVM runner JIT configuration"
}

assert_pool_github_routes() {
  wait_for_mock_route GET "/api/v3/orgs/test-owner/installation" \
    "Pool looked up the GitHub App installation"
  wait_for_mock_route POST "/api/v3/app/installations/123/access_tokens" \
    "Pool requested a GitHub App installation token"
  wait_for_mock_route GET "/api/v3/orgs/test-owner/actions/runners" \
    "Pool listed organization runners"
  wait_for_mock_route GET "/api/v3/orgs/test-owner/actions/runner-groups" \
    "Pool resolved the Default GitHub runner group"
  wait_for_mock_route POST "/api/v3/orgs/test-owner/actions/runners/generate-jitconfig" \
    "Pool generated the MicroVM runner JIT configuration"
}

assert_scale_down_github_routes() {
  runner_id="$1"
  wait_for_mock_route POST "/api/v3/app/installations/123/access_tokens" \
    "Scale-down requested a GitHub App installation token"
  wait_for_mock_route GET "/api/v3/orgs/test-owner/actions/runners" \
    "Scale-down listed organization runners"
  wait_for_mock_route GET "/api/v3/orgs/test-owner/actions/runners/${runner_id}" \
    "Scale-down checked the runner busy state"
  wait_for_mock_route DELETE "/api/v3/orgs/test-owner/actions/runners/${runner_id}" \
    "Scale-down deleted the runner from GitHub"
}

configure_mock_runner_state() {
  microvm_id="$1"
  runner_id="$2"
  MOCKSERVER_URL="$mock_service_url" python3 - "$microvm_id" "$runner_id" <<'PY'
import json
import os
import sys
import urllib.request

microvm_id, runner_id = sys.argv[1:]
runner_id = int(runner_id)
base = "/api/v3/orgs/test-owner/actions/runners"

def control(path, method, payload):
    request = urllib.request.Request(
        f'{os.environ["MOCKSERVER_URL"]}{path}',
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        if response.status not in (200, 201, 202):
            raise RuntimeError(f'MockServer API rejected {method} {path} with HTTP {response.status}')

def clear(method, path):
    control("/mockserver/clear", "PUT", {"httpRequest": {"method": method, "path": path}})

def expect(method, path, status, body=None):
    response = {"statusCode": status}
    if body is not None:
        response["headers"] = {"Content-Type": ["application/json"]}
        response["body"] = json.dumps(body)
    control(
        "/mockserver/expectation",
        "PUT",
        {"httpRequest": {"method": method, "path": path}, "httpResponse": response},
    )

state_path = f"{base}/{runner_id}"
clear("GET", base)
clear("GET", state_path)
clear("DELETE", state_path)
expect(
    "GET",
    base,
    200,
    {
        "total_count": 1,
        "runners": [
            {
                "id": runner_id,
                "name": f"microvm-{microvm_id}",
                "os": "linux",
                "status": "offline",
                "busy": False,
                "labels": [],
            }
        ],
    },
)
expect(
    "GET",
    state_path,
    200,
    {
        "id": runner_id,
        "name": f"microvm-{microvm_id}",
        "os": "linux",
        "status": "offline",
        "busy": False,
        "labels": [],
    },
)
expect("DELETE", state_path, 204)
PY
}

configure_mock_runner_removed() {
  runner_id="$1"
  MOCKSERVER_URL="$mock_service_url" python3 - "$runner_id" <<'PY'
import json
import os
import sys
import urllib.request

runner_id = sys.argv[1]
path = f"/api/v3/orgs/test-owner/actions/runners/{runner_id}"

def control(path, method, payload):
    request = urllib.request.Request(
        f'{os.environ["MOCKSERVER_URL"]}{path}',
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        if response.status not in (200, 201, 202):
            raise RuntimeError(f'MockServer API rejected {method} {path} with HTTP {response.status}')

control("/mockserver/clear", "PUT", {"httpRequest": {"method": "GET", "path": path}})
control(
    "/mockserver/expectation",
    "PUT",
    {
        "httpRequest": {"method": "GET", "path": path},
        "httpResponse": {
            "statusCode": 404,
            "headers": {"Content-Type": ["application/json"]},
            "body": '{"message":"Not Found"}',
        },
    },
)
PY
}

configure_empty_mock_runner_list() {
  MOCKSERVER_URL="$mock_service_url" python3 - <<'PY'
import json
import os
import urllib.request

path = "/api/v3/orgs/test-owner/actions/runners"
clear_request = urllib.request.Request(
    f'{os.environ["MOCKSERVER_URL"]}/mockserver/clear',
    data=json.dumps({"httpRequest": {"method": "GET", "path": path}}).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="PUT",
)
with urllib.request.urlopen(clear_request, timeout=10) as response:
    if response.status not in (200, 201):
        raise RuntimeError(f"MockServer runner-list expectation clear rejected with HTTP {response.status}")

request = urllib.request.Request(
    f'{os.environ["MOCKSERVER_URL"]}/mockserver/expectation',
    data=json.dumps(
        {
            "httpRequest": {"method": "GET", "path": path},
            "httpResponse": {
                "statusCode": 200,
                "headers": {"Content-Type": ["application/json"]},
                "body": '{"total_count":0,"runners":[]}',
            },
        }
    ).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="PUT",
)
with urllib.request.urlopen(request, timeout=10) as response:
    if response.status not in (200, 201):
        raise RuntimeError(f"MockServer API rejected pool runner expectation with HTTP {response.status}")
PY
}

assert_mock_runner_removed() {
  runner_id="$1"
  status_code=$(curl -sS --max-time 5 -o "$response_file" -w '%{http_code}' \
    "${mock_service_url}/api/v3/orgs/test-owner/actions/runners/${runner_id}")
  if [ "$status_code" != 404 ]; then
    echo "Expected GitHub API mock to return 404 for removed runner $runner_id, got HTTP $status_code." >&2
    sed -n '1,80p' "$response_file" >&2
    exit 1
  fi
  printf '  [PASS] GitHub API mock reports runner %s removed (HTTP 404)\n' "$runner_id"
}

wait_for_microvm_termination() {
  microvm_id="$1"
  description="$2"
  attempts=60
  while :; do
    if details=$(aws --endpoint-url "$AWS_ENDPOINT_URL" lambda-microvms get-microvm \
      --microvm-identifier "$microvm_id" --output json 2>/dev/null); then
      state=$(printf '%s' "$details" | json_field state)
      if [ "$state" = "TERMINATED" ]; then
        printf '  [PASS] MiniStack Lambda MicroVM API reports %s terminated\n' "$description"
        return
      fi
    else
      state="not found"
    fi
    attempts=$((attempts - 1))
    if [ "$attempts" -le 0 ]; then
      echo "Timed out waiting for $description to terminate; current state: $state." >&2
      exit 1
    fi
    sleep 2
  done
}

invoke_lambda() {
  function_name="$1"
  payload="$2"
  description="$3"
  invocation_result=$(aws --endpoint-url "$AWS_ENDPOINT_URL" lambda invoke \
    --cli-binary-format raw-in-base64-out \
    --invocation-type RequestResponse \
    --function-name "$function_name" \
    --payload "$payload" \
    "$lambda_response_file" --output json)
  if printf '%s' "$invocation_result" | grep -Fq '"FunctionError"'; then
    echo "Lambda invocation returned FunctionError for $function_name." >&2
    exit 1
  fi
  printf '  [PASS] %s (Lambda API accepted the request)\n' "$description"
}

before_microvm_ids=$(list_microvm_ids)
terraform_initialized=true
cp "$tfvars_source" "$tfvars_file"
printf '\norganization_runners = true\n' >> "$tfvars_file"
printf '%s\n' \
  'module "runners" {' \
  '  global_config_github = {' \
  '    app = var.github_app' \
  '    enterprise_server = {' \
  "      url = \"http://${mock_host}:${mock_port}\"" \
  '      ssl_verify = false' \
  '    }' \
  '  }' \
  '}' > "$override_file"
"$source_root/tests/ministack/run-example.sh" apply microvm "$tfvars_file"

webhook_endpoint=$(terraform -chdir="$example_root" output -raw webhook_endpoint)
endpoint_host_port=${AWS_ENDPOINT_URL#*://}
endpoint_port=${endpoint_host_port##*:}
api_host_port=${webhook_endpoint#*://}
api_host_port=${api_host_port%%/*}
api_host=${api_host_port%:*}
webhook_secret=$(aws --endpoint-url "$AWS_ENDPOINT_URL" ssm get-parameter \
  --name /ministack/microvm/webhook-secret --query 'Parameter.Value' --output text)

send_webhook "$fixture" "ministack-microvm-smoke-123456"
wait_for_log_event "/aws/lambda/microvm-ministack-microvm-webhook" "123456" \
  "Webhook Lambda received MicroVM workflow job 123456"
wait_for_log_event "/aws/lambda/microvm-ministack-microvm-dispatch-to-runner" "123456" \
  "EventBridge invoked the MicroVM dispatcher Lambda"
wait_for_log_event "/aws/lambda/microvm-ministack-microvm-scale-up" "123456" \
  "Dispatcher delivered workflow job 123456 through SQS to the MicroVM scale-up Lambda"
assert_scale_up_github_routes
wait_for_microvm "scale-up-lambda" "a scale-up MicroVM"
scale_up_microvm_id=$(printf '%s' "$discovered_microvm_ids" | awk '{print $1}')
assert_microvm_running "$scale_up_microvm_id"
EXPECTED_SOURCE="scale-up-lambda" assert_metadata "$scale_up_microvm_id" "scale-up-lambda"

scale_up_runner_id=987654321
configure_mock_runner_state "$scale_up_microvm_id" "$scale_up_runner_id"
clear_mock_request_log
invoke_lambda "microvm-ministack-microvm-scale-down" \
  '{"smokeMarker":"ministack-microvm-scale-up-scale-down","type":"microvm"}' \
  "MicroVM scale-down Lambda invoked for the webhook runner"
wait_for_log_event "/aws/lambda/microvm-ministack-microvm-scale-down" "ministack-microvm-scale-up-scale-down" \
  "MicroVM scale-down Lambda started processing the webhook runner"
assert_scale_down_github_routes "$scale_up_runner_id"
configure_mock_runner_removed "$scale_up_runner_id"
assert_mock_runner_removed "$scale_up_runner_id"
wait_for_microvm_termination "$scale_up_microvm_id" "the webhook MicroVM"
assert_parameter_absent "$runner_token_ssm_path/$scale_up_microvm_id" \
  "the webhook MicroVM JIT configuration was cleaned up"

echo "MiniStack MicroVM smoke chain 1 passed: API Gateway -> webhook -> EventBridge -> dispatcher -> SQS -> RunMicrovm -> SSM ownership metadata -> GitHub API mock -> TerminateMicrovm."

configure_empty_mock_runner_list
clear_mock_request_log
invoke_lambda "microvm-ministack-microvm-pool" '{"poolSize":1,"type":"microvm"}' \
  "MicroVM pool Lambda invoked to maintain one runner"
assert_pool_github_routes
wait_for_log_event "/aws/lambda/microvm-ministack-microvm-pool" "topped up with 1 runners" \
  "MicroVM pool Lambda requested one runner"
wait_for_microvm "pool-lambda" "a pool MicroVM"
pool_microvm_id=$(printf '%s' "$discovered_microvm_ids" | awk '{print $2}')
assert_microvm_running "$pool_microvm_id"
EXPECTED_SOURCE="pool-lambda" assert_metadata "$pool_microvm_id" "pool-lambda"

pool_runner_id=987654321
configure_mock_runner_state "$pool_microvm_id" "$pool_runner_id"
clear_mock_request_log
invoke_lambda "microvm-ministack-microvm-scale-down" \
  '{"smokeMarker":"ministack-microvm-pool-scale-down","type":"microvm"}' \
  "MicroVM scale-down Lambda invoked for the pool runner"
wait_for_log_event "/aws/lambda/microvm-ministack-microvm-scale-down" "ministack-microvm-pool-scale-down" \
  "MicroVM scale-down Lambda started processing the pool runner"
assert_scale_down_github_routes "$pool_runner_id"
configure_mock_runner_removed "$pool_runner_id"
assert_mock_runner_removed "$pool_runner_id"
wait_for_microvm_termination "$pool_microvm_id" "the pool MicroVM"
assert_parameter_absent "$runner_token_ssm_path/$pool_microvm_id" \
  "the pool MicroVM JIT configuration was cleaned up"

echo "MiniStack MicroVM smoke chain 2 passed: MicroVM pool -> GitHub API mock -> RunMicrovm -> scale-down -> GitHub API mock -> TerminateMicrovm."
echo "MiniStack MicroVM smoke tests passed: webhook and pool lifecycle chains completed."
