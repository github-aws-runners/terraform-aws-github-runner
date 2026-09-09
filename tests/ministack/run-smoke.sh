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
example_root="$source_root/examples/default"
mock_expectations="$script_dir/github-api-expectations.json"
fixture="$script_dir/workflow_job_event.json"
mock_host="${MINISTACK_GITHUB_MOCK_HOST:-host.docker.internal}"
mock_port="${MINISTACK_GITHUB_MOCK_PORT:-}"
mock_service_url="${MINISTACK_GITHUB_MOCK_URL:-}"
mock_image="${MINISTACK_GITHUB_MOCK_IMAGE:-mockserver/mockserver:7.6.0@sha256:80b3b1a26f3553d0c81a3f3896b5b7274c17b2a2e52f0fd2b28e246bc9efa290}"
mock_container=""
tfvars_file=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-smoke.XXXXXX")
app_key_file=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-github-app.XXXXXX")
response_file=$(mktemp "${TMPDIR:-/tmp}/terraform-aws-github-runner-smoke-response.XXXXXX")
override_file="$example_root/zz_ministack_smoke_override.tf"
terraform_initialized=false

cleanup() {
  set +e
  if [ "$terraform_initialized" = true ]; then
    "$source_root/tests/ministack/run-example.sh" destroy default "$tfvars_file" >/dev/null 2>&1
  fi
  if [ -n "$mock_container" ]; then
    docker rm -f "$mock_container" >/dev/null 2>&1
  fi
  rm -f "$override_file" "$tfvars_file" "$app_key_file" "$response_file"
}
trap cleanup EXIT INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required to run the MiniStack smoke test." >&2
    exit 69
  fi
}

for command in aws curl openssl python3 terraform; do
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
  mock_container="terraform-aws-github-runner-github-api-mock-$$"
  mock_service_url="http://127.0.0.1:${mock_port}"
fi

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$app_key_file" 2>/dev/null
app_key_base64=$(base64 < "$app_key_file" | tr -d '\n')
APP_KEY_BASE64="$app_key_base64" python3 - "$script_dir/default.tfvars" "$tfvars_file" <<'PY'
import os
import sys

source, destination = sys.argv[1:]
replacement = os.environ["APP_KEY_BASE64"]
with open(source, encoding="utf-8") as source_file:
    lines = source_file.readlines()
with open(destination, "w", encoding="utf-8") as destination_file:
    for line in lines:
        if line.lstrip().startswith("key_base64 ="):
            destination_file.write(f'  key_base64 = "{replacement}"\n')
        elif line.lstrip().startswith('id') and '=' in line:
            destination_file.write('  id = "123"\n')
        else:
            destination_file.write(line)
PY
unset app_key_base64 APP_KEY_BASE64

printf '%s\n' \
  'module "runners" {' \
  "  ghes_url = \"http://${mock_host}:${mock_port}\"" \
  '  ghes_ssl_verify = false' \
  '  eventbridge = {' \
  '    enable = true' \
  '    accept_events = ["workflow_job"]' \
  '  }' \
  '  delay_webhook_event = 0' \
  '  runners_maximum_count = 1' \
  '  enable_job_queued_check = true' \
  '  enable_jit_config = false' \
  '  enable_runner_binaries_syncer = false' \
  '  log_level = "debug"' \
  '}' \
  '' \
  'module "webhook_github_app" {' \
  '  count = 0' \
  '}' > "$override_file"

if [ -n "$mock_container" ]; then
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

terraform_initialized=true
"$source_root/tests/ministack/run-example.sh" apply default "$tfvars_file"

webhook_endpoint=$(terraform -chdir="$example_root" output -raw webhook_endpoint)
endpoint_host_port=${AWS_ENDPOINT_URL#*://}
endpoint_port=${endpoint_host_port##*:}
api_host_port=${webhook_endpoint#*://}
api_host_port=${api_host_port%%/*}
api_host=${api_host_port%:*}
webhook_secret=$(terraform -chdir="$example_root" output -raw webhook_secret)
signature=$(openssl dgst -sha256 -hmac "$webhook_secret" "$fixture" | awk '{print $NF}')

status_code=$(curl -sS --max-time 15 -o "$response_file" -w '%{http_code}' \
  --connect-to "${api_host}:4566:127.0.0.1:${endpoint_port}" \
  -X POST "$webhook_endpoint" \
  -H 'Content-Type: application/json' \
  -H 'X-GitHub-Event: workflow_job' \
  -H 'X-GitHub-Delivery: ministack-smoke-123456' \
  -H 'X-GitHub-Hook-Installation-Target-ID: 123' \
  -H "X-Hub-Signature-256: sha256=${signature}" \
  --data-binary "@$fixture")

if [ "$status_code" != 201 ]; then
  echo "Webhook smoke request failed with HTTP $status_code." >&2
  sed -n '1,80p' "$response_file" >&2
  exit 1
fi

wait_for_log_event() {
  log_group="$1"
  marker="$2"
  attempts=60
  while ! aws --endpoint-url "$AWS_ENDPOINT_URL" logs filter-log-events \
    --log-group-name "$log_group" --limit 50 --output text 2>/dev/null | grep -Fq "$marker"; do
    attempts=$((attempts - 1))
    if [ "$attempts" -le 0 ]; then
      echo "Timed out waiting for MiniStack log marker '$marker' in $log_group." >&2
      exit 1
    fi
    sleep 2
  done
}

wait_for_log_event "/aws/lambda/ministack-default-webhook" "123456"
wait_for_log_event "/aws/lambda/ministack-default-dispatch-to-runner" "123456"
wait_for_log_event "/aws/lambda/ministack-default-scale-up" "123456"

wait_for_mock_route() {
  method="$1"
  route="$2"
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
}

wait_for_mock_route POST "/api/v3/app/installations/123/access_tokens"
wait_for_mock_route GET "/api/v3/repos/test-owner/test-repo/actions/jobs/123456"
wait_for_mock_route POST "/api/v3/orgs/test-owner/actions/runners/registration-token"

echo "MiniStack smoke chain passed: API Gateway -> webhook -> EventBridge -> dispatcher -> SQS -> scale-up -> GitHub API mock."
