#!/usr/bin/env bash
set -euo pipefail

container_name="scale-set-service-smoke-${GITHUB_RUN_ID:-$$}"
response_file="$(mktemp)"
# shellcheck disable=SC2329 # cleanup is invoked indirectly by the EXIT trap.
cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  rm -f "$response_file"
}
trap cleanup EXIT

scale_set_controller_manifest='{"version":1,"groupName":"ci-smoke","revision":"image-test","reconcilers":[{"schemaVersion":1,"runnerConfigName":"smoke","scaleSetId":1,"scaleSetName":"ci-smoke","githubConfigUrl":"https://github.com/example-org","githubApp":{"appIdParameterName":"/ci/app-id","privateKeyParameterName":"/ci/private-key"},"computeProvider":{"type":"ec2","configuration":{"region":"us-east-1","environment":"ci","runnerNamePrefix":"ci","jitConfigParameterPath":"/ci/jit","subnets":["subnet-00000000"],"launchTemplateName":"ci","ec2instanceCriteria":{"instanceTypes":["t3.micro"],"targetCapacityType":"on-demand","instanceAllocationStrategy":"lowest-price"}}},"minRunners":0,"maxRunners":0}]}'

docker run --detach \
  --name "$container_name" \
  --network none \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --env AWS_REGION=us-east-1 \
  --env AWS_EC2_METADATA_DISABLED=true \
  --env SCALE_SET_HEALTH_PORT=8080 \
  --env "SCALE_SET_CONTROLLER_MANIFEST=$scale_set_controller_manifest" \
  scale-set-service:smoke-test

attempt=0
while (( attempt < 30 )); do
  ((attempt += 1))
  docker exec "$container_name" node --input-type=module -e \
    'const response = await fetch("http://127.0.0.1:8080/healthz", { signal: AbortSignal.timeout(1000) }); process.stdout.write(JSON.stringify({ status: response.status, body: await response.json() }));' \
    >"$response_file" 2>/dev/null || true
  if jq --exit-status \
    --arg group_name ci-smoke \
    '(.status == 200 or .status == 503) and .body.groupName == $group_name and (.body.live | type == "boolean") and (.body.ready | type == "boolean") and .body.reconcilers.smoke != null' \
    "$response_file" >/dev/null 2>&1; then
    jq . "$response_file"
    exit 0
  fi
  sleep 1
done

docker logs "$container_name"
echo "scale-set service image did not return the expected health response" >&2
exit 1
