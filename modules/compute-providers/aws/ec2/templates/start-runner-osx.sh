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
    if ! aws ec2 terminate-instances \
      --instance-ids "$instance_id" \
      --region "$region"; then
      # terminate-instances fails when credentials are unavailable (see #5517);
      # the launch template sets instance_initiated_shutdown_behavior to
      # "terminate", so shutting down ends the instance without API calls.
      echo "WARNING: terminate-instances failed; falling back to shutdown -h now"
      sudo shutdown -h now || true
    fi
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

# Wait for instance profile credentials before the first AWS CLI call. On
# prebuilt AMIs the first call can race credential availability and fail with
# NoCredentials, leaving the instance unregistered but running (see #5517).
echo "Waiting for instance profile credentials to become available"
credential_wait_retries=0
until aws sts get-caller-identity --region "$region" >/dev/null 2>&1; do
  credential_wait_retries=$((credential_wait_retries + 1))
  if [ "$credential_wait_retries" -ge 12 ]; then
    echo "WARNING: instance profile credentials still unavailable after 60 s; continuing anyway"
    break
  fi
  echo "Instance profile credentials not available yet, retrying in 5 seconds ($credential_wait_retries/12)"
  sleep 5
done
echo "Instance profile credentials available"

environment=$(curl -f -H "X-aws-ec2-metadata-token: $token" \
  http://169.254.169.254/latest/meta-data/tags/instance/ghr:environment || echo "")
ssm_config_path=$(curl -f -H "X-aws-ec2-metadata-token: $token" \
  http://169.254.169.254/latest/meta-data/tags/instance/ghr:ssm_config_path || echo "")
runner_name_prefix=$(curl -f -H "X-aws-ec2-metadata-token: $token" \
  http://169.254.169.254/latest/meta-data/tags/instance/ghr:runner_name_prefix || echo "")

echo "Retrieved ghr:environment tag - ($environment)"
echo "Retrieved ghr:ssm_config_path tag - ($ssm_config_path)"
echo "Retrieved ghr:runner_name_prefix tag - ($runner_name_prefix)"

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

echo "Get GH Runner config from AWS SSM"
config=$(aws ssm get-parameter --name "$token_path"/"$instance_id" --with-decryption --region "$region" | jq -r ".Parameter | .Value")
while [[ -z "$config" ]]; do
  echo "Waiting for GH Runner config to become available in AWS SSM"
  sleep 1
  config=$(aws ssm get-parameter --name "$token_path"/"$instance_id" --with-decryption --region "$region" | jq -r ".Parameter | .Value")
done

echo "Delete GH Runner token from AWS SSM"
# The token parameter may briefly refuse deletion with AccessDenied right after
# the read (IAM propagation delay), so retry before giving up (see #5517).
delete_retrycount=0
while true; do
  if aws ssm delete-parameter --name "$token_path"/"$instance_id" --region "$region" 2>/tmp/delete-parameter.err; then
    break
  fi
  if grep -q "AccessDenied" /tmp/delete-parameter.err 2>/dev/null && [ "$delete_retrycount" -lt 24 ]; then
    delete_retrycount=$((delete_retrycount + 1))
    echo "delete-parameter access denied, retrying in 5 seconds ($delete_retrycount/24)"
    sleep 5
  else
    echo "ERROR: failed to delete SSM parameter $token_path/$instance_id"
    cat /tmp/delete-parameter.err >&2
    exit 1
  fi
done

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
