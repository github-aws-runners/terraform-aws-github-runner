#!/bin/bash

# macOS variant of start-runner.sh

tag_instance_with_runner_id() {
  echo "Checking for .runner file to extract agent ID"

  if [[ ! -f "/opt/actions-runner/.runner" ]]; then
    echo "Warning: .runner file not found"
    return 0
  fi

  echo "Found .runner file, extracting agent ID"
  local agent_id
  agent_id=$(jq -r '.agentId' /opt/actions-runner/.runner 2>/dev/null || echo "")

  if [[ -z "$agent_id" || "$agent_id" == "null" ]]; then
    echo "Warning: Could not extract agent ID from .runner file"
    return 0
  fi

  echo "Tagging instance with GitHub runner agent ID: $agent_id"
  if aws ec2 create-tags \
    --region "$region" \
    --resources "$instance_id" \
    --tags Key=ghr:github_runner_id,Value="$agent_id"; then
    echo "Successfully tagged instance with agent ID: $agent_id"
    return 0
  else
    echo "Warning: Failed to tag instance with agent ID"
    return 0
  fi
}

cleanup() {
  local exit_code="$1"

  if [ "$exit_code" -ne 0 ]; then
    echo "ERROR: runner-start-failed with exit code $exit_code"
  fi

  if [ "$agent_mode" = "ephemeral" ] || [ "$exit_code" -ne 0 ]; then
    echo "Terminating instance"
    aws ec2 terminate-instances \
      --instance-ids "$instance_id" \
      --region "$region" || true
  fi
}

trap 'cleanup $?' EXIT

echo "Retrieving TOKEN from AWS API"
token=$(curl -f -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 180" || true)
if [ -z "$token" ]; then
  retrycount=0
  until [ -n "$token" ]; do
    echo "Failed to retrieve token. Retrying in 5 seconds."
    sleep 5
    token=$(curl -f -X PUT "http://169.254.169.254/latest/api/token" \
      -H "X-aws-ec2-metadata-token-ttl-seconds: 180" || true)
    retrycount=$((retrycount + 1))
    if [ $retrycount -gt 40 ]; then
      break
    fi
  done
fi

region=$(curl -f -H "X-aws-ec2-metadata-token: $token" \
  http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region)
echo "Retrieved REGION from AWS API ($region)"

instance_id=$(curl -f -H "X-aws-ec2-metadata-token: $token" \
  http://169.254.169.254/latest/meta-data/instance-id)
echo "Retrieved INSTANCE_ID from AWS API ($instance_id)"

availability_zone=$(curl -f -H "X-aws-ec2-metadata-token: $token" \
  http://169.254.169.254/latest/meta-data/placement/availability-zone)

environment=$(curl -f -H "X-aws-ec2-metadata-token: $token" \
  http://169.254.169.254/latest/meta-data/tags/instance/ghr:environment || echo "")
ssm_config_path=$(curl -f -H "X-aws-ec2-metadata-token: $token" \
  http://169.254.169.254/latest/meta-data/tags/instance/ghr:ssm_config_path || echo "")
runner_name_prefix=$(curl -f -H "X-aws-ec2-metadata-token: $token" \
  http://169.254.169.254/latest/meta-data/tags/instance/ghr:runner_name_prefix || echo "")

echo "Retrieved ghr:environment tag - ($environment)"
echo "Retrieved ghr:ssm_config_path tag - ($ssm_config_path)"
echo "Retrieved ghr:runner_name_prefix tag - ($runner_name_prefix)"

%{ if storage_provider_type == "aws_dynamodb" }
dynamodb_config_table_name=$(printf '%s' "${dynamodb_config_table_name_base64}" | openssl base64 -d -A)
dynamodb_scope=$(printf '%s' "${dynamodb_scope_base64}" | openssl base64 -d -A)
ec2_instance_arn_prefix=$(printf '%s' "${ec2_instance_arn_prefix_base64}" | openssl base64 -d -A)

echo "Retrieving runner bootstrap configuration from DynamoDB"
runner_config_key=$(jq -cn --arg scope "$dynamodb_scope" '{scope:{S:$scope},id:{S:"runner-config"}}')
runner_config_record=$(aws dynamodb get-item \
  --table-name "$dynamodb_config_table_name" \
  --key "$runner_config_key" \
  --consistent-read \
  --projection-expression "#value" \
  --expression-attribute-names '{"#value":"value"}' \
  --region "$region")
runner_config=$(printf '%s' "$runner_config_record" | jq -er '.Item.value.S | fromjson')
unset runner_config_record

run_as=$(printf '%s' "$runner_config" | jq -r '.run_as')
agent_mode=$(printf '%s' "$runner_config" | jq -r '.agent_mode')
disable_default_labels=$(printf '%s' "$runner_config" | jq -r '.disable_default_labels')
enable_jit_config=$(printf '%s' "$runner_config" | jq -r '.enable_jit_config')
dynamodb_runner_state_table_name=$(printf '%s' "$runner_config" | jq -er '.runner_config_storage.table_name')
dynamodb_access_scope_type=$(printf '%s' "$runner_config" | jq -er '.runner_config_storage.access_scope')
dynamodb_config_id=$(printf '%s' "$runner_config" | jq -er '.runner_config_storage.id')
if [[ "$dynamodb_access_scope_type" != "compute-resource" ]]; then
  echo "Unsupported runner configuration access scope"
  exit 1
fi
dynamodb_access_scope="$${ec2_instance_arn_prefix}$instance_id"
unset runner_config
%{ else }
parameters=$(aws ssm get-parameters-by-path \
  --path "$ssm_config_path" \
  --region "$region" \
  --query "Parameters[*].{Name:Name,Value:Value}")
echo "Retrieved parameters from AWS SSM ($parameters)"

run_as=$(echo "$parameters" | jq -r '.[] | select(.Name == "'$ssm_config_path'/run_as") | .Value')
echo "Retrieved /$ssm_config_path/run_as parameter - ($run_as)"

agent_mode=$(echo "$parameters" | jq -r '.[] | select(.Name == "'$ssm_config_path'/agent_mode") | .Value')
echo "Retrieved /$ssm_config_path/agent_mode parameter - ($agent_mode)"

disable_default_labels=$(echo "$parameters" | jq -r '.[] | select(.Name == "'$ssm_config_path'/disable_default_labels") | .Value')
echo "Retrieved /$ssm_config_path/disable_default_labels parameter - ($disable_default_labels)"

enable_jit_config=$(echo "$parameters" | jq -r '.[] | select(.Name == "'$ssm_config_path'/enable_jit_config") | .Value')
echo "Retrieved /$ssm_config_path/enable_jit_config parameter - ($enable_jit_config)"

token_path=$(echo "$parameters" | jq -r '.[] | select(.Name == "'$ssm_config_path'/token_path") | .Value')
echo "Retrieved /$ssm_config_path/token_path parameter - ($token_path)"
%{ endif }

%{ if storage_provider_type == "aws_dynamodb" }
echo "Retrieving one-time runner configuration from DynamoDB"
runner_state_key=$(jq -cn --arg scope "$dynamodb_access_scope" --arg id "$dynamodb_config_id" '{scope:{S:$scope},id:{S:$id}}')
config=""
retrycount=0
while [[ -z "$config" ]]; do
  now_epoch=$(date +%s)
  expression_values=$(jq -cn --arg now "$now_epoch" '{":now":{N:$now}}')
  if config_record=$(aws dynamodb delete-item \
    --table-name "$dynamodb_runner_state_table_name" \
    --key "$runner_state_key" \
    --condition-expression "attribute_exists(#expires_at) AND #expires_at > :now" \
    --expression-attribute-names '{"#expires_at":"expires_at"}' \
    --expression-attribute-values "$expression_values" \
    --return-values ALL_OLD \
    --region "$region" 2>/dev/null); then
    config=$(printf '%s' "$config_record" | jq -er '.Attributes.value.S')
    unset config_record
    break
  fi

  retrycount=$((retrycount + 1))
  if [[ $retrycount -gt 40 ]]; then
    echo "Runner configuration was unavailable or expired"
    exit 1
  fi
  echo "Waiting for runner configuration to become available in DynamoDB"
  sleep 1
done
%{ else }
echo "Get GH Runner config from AWS SSM"
config=$(aws ssm get-parameter --name "$token_path"/"$instance_id" --with-decryption --region "$region" | jq -r ".Parameter | .Value")
while [[ -z "$config" ]]; do
  echo "Waiting for GH Runner config to become available in AWS SSM"
  sleep 1
  config=$(aws ssm get-parameter --name "$token_path"/"$instance_id" --with-decryption --region "$region" | jq -r ".Parameter | .Value")
done

echo "Delete GH Runner token from AWS SSM"
aws ssm delete-parameter --name "$token_path"/"$instance_id" --region "$region"
%{ endif }

if [ -z "$run_as" ]; then
  echo "No user specified, using default ec2-user account"
  run_as="ec2-user"
fi

if [[ "$run_as" == "root" ]]; then
  echo "run_as is set to root - export RUNNER_ALLOW_RUNASROOT=1"
  export RUNNER_ALLOW_RUNASROOT=1
fi

sudo chown -R "$run_as" /opt/actions-runner

info_arch=$(uname -m)
info_os=$(sw_vers -productName 2>/dev/null || echo "macOS")
info_ver=$(sw_vers -productVersion 2>/dev/null || echo "unknown")

tee /opt/actions-runner/.setup_info <<EOL
[
  {
    "group": "Operating System",
    "detail": "Distribution: $info_os $info_ver\nArchitecture: $info_arch"
  },
  {
    "group": "EC2",
    "detail": "Instance id: $instance_id\nAvailability zone: $availability_zone"
  }
]
EOL

echo "Starting runner as user $run_as"

if [[ "$enable_jit_config" == "false" || $agent_mode != "ephemeral" ]]; then
  echo "Configure GH Runner as user $run_as"
  if [[ "$disable_default_labels" == "true" ]]; then
    extra_flags="--no-default-labels"
  else
    extra_flags=""
  fi

  sudo --preserve-env=RUNNER_ALLOW_RUNASROOT -u "$run_as" -- ./config.sh \
    $extra_flags \
    --unattended \
    --name "$runner_name_prefix$instance_id" \
    --work "_work" $config

  tag_instance_with_runner_id
fi

if [[ $agent_mode = "ephemeral" ]]; then
  echo "Starting the runner in ephemeral mode"

  if [[ "$enable_jit_config" == "true" ]]; then
    echo "Starting with JIT config"
    sudo --preserve-env=RUNNER_ALLOW_RUNASROOT -u "$run_as" -- ./run.sh --jitconfig $config
  else
    echo "Starting without JIT config"
    sudo --preserve-env=RUNNER_ALLOW_RUNASROOT -u "$run_as" -- ./run.sh
  fi
  echo "Runner has finished"
else
  echo "Starting the runner in persistent mode (foreground)"
  sudo --preserve-env=RUNNER_ALLOW_RUNASROOT -u "$run_as" -- ./run.sh
fi
