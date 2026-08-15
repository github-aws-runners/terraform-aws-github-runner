#!/bin/bash

# macOS variant of start-runner.sh

# Terraform selects the controller mode; instance tags are lifecycle data only.
scale_set_enabled="${scale_set_enabled}"

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

tag_scale_set_runner_state() {
  local state="$1"
  echo "Tagging scale-set runner instance as $state"
  if aws ec2 create-tags \
    --region "$region" \
    --resources "$instance_id" \
    --tags Key=ghr:scale_set_state,Value="$state"; then
    echo "Successfully tagged scale-set runner instance as $state"
    return 0
  else
    echo "ERROR: Failed to tag scale-set runner instance as $state"
    return 1
  fi
}

cleanup() {
  local exit_code="$1"

  if [ "$exit_code" -ne 0 ]; then
    echo "ERROR: runner-start-failed with exit code $exit_code"
    if [[ "$scale_set_enabled" == "true" ]]; then
      tag_scale_set_runner_state "stopped" || true
    fi
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
scale_set_state=$(curl -f -H "X-aws-ec2-metadata-token: $token" \
  http://169.254.169.254/latest/meta-data/tags/instance/ghr:scale_set_state || echo "")

echo "Retrieved ghr:environment tag - ($environment)"
echo "Retrieved ghr:ssm_config_path tag - ($ssm_config_path)"
echo "Retrieved ghr:runner_name_prefix tag - ($runner_name_prefix)"
echo "Retrieved ghr:scale_set_state tag - ($scale_set_state)"

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

if [[ "$scale_set_enabled" == "true" ]]; then
  if [[ "$enable_jit_config" != "true" || "$agent_mode" != "ephemeral" ]]; then
    echo "ERROR: Scale-set runners require JIT configuration and ephemeral mode"
    exit 1
  fi

  while [[ "$scale_set_state" != "config-published" ]]; do
    echo "Waiting for scale-set runner config to be published"
    sleep 1
    scale_set_state=$(aws ec2 describe-tags \
      --region "$region" \
      --filters "Name=resource-id,Values=$instance_id" "Name=key,Values=ghr:scale_set_state" \
      --query 'Tags[0].Value' \
      --output text || echo "")
    if [[ "$scale_set_state" == "None" ]]; then
      scale_set_state=""
    fi
  done
  echo "Scale-set runner config is published"
fi

echo "Get GH Runner config from AWS SSM"
if [[ "$scale_set_enabled" == "true" ]]; then
  config=""
  for attempt in {1..30}; do
    config=$(aws ssm get-parameter --name "$token_path/$instance_id" --with-decryption --region "$region" 2>/dev/null | jq -r ".Parameter | .Value" 2>/dev/null || true)
    if [[ -n "$config" && "$config" != "null" ]]; then
      break
    fi
    echo "Waiting for GH Runner config to become available in AWS SSM ($attempt/30)"
    sleep 1
  done
  if [[ -z "$config" || "$config" == "null" ]]; then
    echo "ERROR: Failed to retrieve scale-set runner config from AWS SSM"
    exit 1
  fi
else
  config=$(aws ssm get-parameter --name "$token_path/$instance_id" --with-decryption --region "$region" | jq -r ".Parameter | .Value")
  while [[ -z "$config" ]]; do
    echo "Waiting for GH Runner config to become available in AWS SSM"
    sleep 1
    config=$(aws ssm get-parameter --name "$token_path/$instance_id" --with-decryption --region "$region" | jq -r ".Parameter | .Value")
  done
fi

echo "Delete GH Runner token from AWS SSM"
if [[ "$scale_set_enabled" == "true" ]]; then
  if ! aws ssm delete-parameter --name "$token_path"/"$instance_id" --region "$region"; then
    echo "ERROR: Failed to delete scale-set runner config from AWS SSM"
    exit 1
  fi
else
  aws ssm delete-parameter --name "$token_path"/"$instance_id" --region "$region"
fi

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
    if [[ "$scale_set_enabled" == "true" ]]; then
      if ! tag_scale_set_runner_state "ready"; then
        exit 1
      fi
    fi
    sudo --preserve-env=RUNNER_ALLOW_RUNASROOT -u "$run_as" -- ./run.sh --jitconfig $config
    if [[ "$scale_set_enabled" == "true" ]]; then
      if ! tag_scale_set_runner_state "stopped"; then
        echo "ERROR: Failed to persist the stopped scale-set runner state before termination"
      fi
    fi
  else
    echo "Starting without JIT config"
    sudo --preserve-env=RUNNER_ALLOW_RUNASROOT -u "$run_as" -- ./run.sh
  fi
  echo "Runner has finished"
else
  echo "Starting the runner in persistent mode (foreground)"
  sudo --preserve-env=RUNNER_ALLOW_RUNASROOT -u "$run_as" -- ./run.sh
fi
