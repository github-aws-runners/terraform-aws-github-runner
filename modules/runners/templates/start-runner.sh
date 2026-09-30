#!/bin/bash
# ghr:start-runner:begin

# https://docs.aws.amazon.com/xray/latest/devguide/xray-api-sendingdata.html
# https://docs.aws.amazon.com/xray/latest/devguide/scorekeep-scripts.html
create_xray_start_segment() {
  START_TIME=$(date -d "$(uptime -s)" +%s)
  TRACE_ID=$1
  INSTANCE_ID=$2
  SEGMENT_ID=$(dd if=/dev/random bs=8 count=1 2>/dev/null | od -An -tx1 | tr -d ' \t\n')
  SEGMENT_DOC="{\"trace_id\": \"$TRACE_ID\", \"id\": \"$SEGMENT_ID\", \"start_time\": $START_TIME, \"in_progress\": true, \"name\": \"Runner\",\"origin\": \"AWS::EC2::Instance\", \"aws\": {\"ec2\":{\"instance_id\":\"$INSTANCE_ID\"}}}"
  HEADER='{"format": "json", "version": 1}'
  TRACE_DATA="$HEADER\n$SEGMENT_DOC"
  echo "$HEADER" > document.txt
  echo "$SEGMENT_DOC" >> document.txt
  UDP_IP="127.0.0.1"
  UDP_PORT=2000
  cat document.txt > /dev/udp/$UDP_IP/$UDP_PORT
  echo "$SEGMENT_DOC"
}

create_xray_success_segment() {
  local SEGMENT_DOC=$1
  if [ -z "$SEGMENT_DOC" ]; then
    echo "No segment doc provided"
    return
  fi
  SEGMENT_DOC=$(echo "$SEGMENT_DOC" | jq '. | del(.in_progress)')
  END_TIME=$(date +%s)
  SEGMENT_DOC=$(echo "$SEGMENT_DOC" | jq -c ". + {\"end_time\": $END_TIME}")
  HEADER="{\"format\": \"json\", \"version\": 1}"
  TRACE_DATA="$HEADER\n$SEGMENT_DOC"
  echo "$HEADER" > document.txt
  echo "$SEGMENT_DOC" >> document.txt
  UDP_IP="127.0.0.1"
  UDP_PORT=2000
  cat document.txt > /dev/udp/$UDP_IP/$UDP_PORT
  echo "$SEGMENT_DOC"
}

create_xray_error_segment() {
  local SEGMENT_DOC="$1"
  if [ -z "$SEGMENT_DOC" ]; then
    echo "No segment doc provided"
    return
  fi
  MESSAGE="$2"
  ERROR="{\"exceptions\": [{\"message\": \"$MESSAGE\"}]}"
  SEGMENT_DOC=$(echo "$SEGMENT_DOC" | jq '. | del(.in_progress)')
  END_TIME=$(date +%s)
  SEGMENT_DOC=$(echo "$SEGMENT_DOC" | jq -c ". + {\"end_time\": $END_TIME, \"error\": true, \"cause\": $ERROR }")
  HEADER="{\"format\": \"json\", \"version\": 1}"
  TRACE_DATA="$HEADER\n$SEGMENT_DOC"
  echo "$HEADER" > document.txt
  echo "$SEGMENT_DOC" >> document.txt
  UDP_IP="127.0.0.1"
  UDP_PORT=2000
  cat document.txt > /dev/udp/$UDP_IP/$UDP_PORT
  echo "$SEGMENT_DOC"
}

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

is_warm_standby() {
  [[ "$warm_pool" == "true" && -z "$warm_activated" ]]
}

log_warm_activation_latency() {
  [[ -n "$warm_activated" ]] || return 0
  local activated
  activated=$(date -u -d "$warm_activated" +%s 2> /dev/null || date -u -j -f "%Y-%m-%dT%H:%M:%S" "$${warm_activated%%.*}" +%s 2> /dev/null) || return 0
  echo "warm-pool-activation-latency-seconds=$(( $(date +%s) - activated ))"
}

select_boot_mode() {
  if aws ssm get-parameter --name "$token_path/$instance_id" --region "$region" > /dev/null 2>&1; then
    echo "RUN"
  elif is_warm_standby; then
    echo "PRIME"
  else
    echo "WAIT"
  fi
}

# Cloud-init runs user-data on first boot only, so warm instances rerun this script from a systemd unit.
install_boot_hook() {
  local script=/usr/local/sbin/ghr-start-runner.sh
  mkdir -p /usr/local/sbin
  sed -n '/^# ghr:start-runner:begin$/,/^# ghr:start-runner:end$/p' "$0" > "$script"
  if ! grep -q '^# ghr:start-runner:end$' "$script"; then
    echo "Failed to extract the start script from $0"
    return 1
  fi
  chmod 700 "$script"
  cat > /etc/systemd/system/ghr-start-runner.service <<EOF
[Unit]
Description=GitHub Actions runner start (warm pool)
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/actions-runner
Environment=HOME=/root
ExecStart=/bin/bash -e $script
KillMode=process
StandardOutput=append:/var/log/user-data.log
StandardError=append:/var/log/user-data.log

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload && systemctl enable ghr-start-runner.service
}

cleanup() {
  local exit_code="$1"
  local error_location="$2"
  local error_lineno="$3"

  if [ "$exit_code" -ne 0 ]; then
    echo "ERROR: runner-start-failed with exit code $exit_code occurred on $error_location"
    create_xray_error_segment "$${SEGMENT:-}" "runner-start-failed with exit code $exit_code occurred on $error_location - $error_lineno"
  fi
  if [[ "$boot_mode" != "RUN" ]] && is_warm_standby; then
    echo "Warm pool standby instance, skipping self-termination"
    return
  fi
  # allows to flush the cloud watch logs and traces
  sleep 10
  if [ "$agent_mode" = "ephemeral" ] || [ "$exit_code" -ne 0 ]; then
    echo "Stopping CloudWatch service"
    systemctl stop amazon-cloudwatch-agent.service || true
    echo "Terminating instance"
    aws ec2 terminate-instances \
      --instance-ids "$instance_id" \
      --region "$region" \
      || true
  fi
}

trap 'cleanup $? $LINENO $BASH_LINENO' EXIT

echo "Retrieving TOKEN from AWS API"
token=$(curl -f -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 180" || true)
if [ -z "$token" ]; then
  retrycount=0
  until [ -n "$token" ]; do
    echo "Failed to retrieve token. Retrying in 5 seconds."
    sleep 5
    token=$(curl -f -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 180" || true)
    retrycount=$((retrycount + 1))
    if [ $retrycount -gt 40 ]; then
      break
    fi
  done
fi

ami_id=$(curl -f -H "X-aws-ec2-metadata-token: $token" -v http://169.254.169.254/latest/meta-data/ami-id)

region=$(curl -f -H "X-aws-ec2-metadata-token: $token" -v http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region)
echo "Retrieved REGION from AWS API ($region)"

instance_id=$(curl -f -H "X-aws-ec2-metadata-token: $token" -v http://169.254.169.254/latest/meta-data/instance-id)
echo "Retrieved INSTANCE_ID from AWS API ($instance_id)"

instance_type=$(curl -f -H "X-aws-ec2-metadata-token: $token" -v http://169.254.169.254/latest/meta-data/instance-type)
availability_zone=$(curl -f -H "X-aws-ec2-metadata-token: $token" -v http://169.254.169.254/latest/meta-data/placement/availability-zone)

%{ if metadata_tags == "enabled" }
environment=$(curl -f -H "X-aws-ec2-metadata-token: $token" -v http://169.254.169.254/latest/meta-data/tags/instance/ghr:environment)
ssm_config_path=$(curl -f -H "X-aws-ec2-metadata-token: $token" -v http://169.254.169.254/latest/meta-data/tags/instance/ghr:ssm_config_path)
runner_name_prefix=$(curl -f -H "X-aws-ec2-metadata-token: $token" -v http://169.254.169.254/latest/meta-data/tags/instance/ghr:runner_name_prefix || echo "")
xray_trace_id=$(curl -f -H "X-aws-ec2-metadata-token: $token" -v http://169.254.169.254/latest/meta-data/tags/instance/ghr:trace_id || echo "")
warm_pool=$(curl -f -H "X-aws-ec2-metadata-token: $token" -v http://169.254.169.254/latest/meta-data/tags/instance/ghr:warm-pool || echo "")
warm_activated=$(curl -f -H "X-aws-ec2-metadata-token: $token" -v http://169.254.169.254/latest/meta-data/tags/instance/ghr:warm-activated || echo "")

%{ else }
tags=$(aws ec2 describe-tags --region "$region" --filters "Name=resource-id,Values=$instance_id")
echo "Retrieved tags from AWS API ($tags)"

environment=$(echo "$tags" | jq -r '.Tags[]  | select(.Key == "ghr:environment") | .Value')
ssm_config_path=$(echo "$tags" | jq -r '.Tags[]  | select(.Key == "ghr:ssm_config_path") | .Value')
runner_name_prefix=$(echo "$tags" | jq -r '.Tags[]  | select(.Key == "ghr:runner_name_prefix") | .Value' || echo "")
xray_trace_id=$(echo "$tags" | jq -r '.Tags[]  | select(.Key == "ghr:trace_id") | .Value' || echo "")
warm_pool=$(echo "$tags" | jq -r '.Tags[]  | select(.Key == "ghr:warm-pool") | .Value')
warm_activated=$(echo "$tags" | jq -r '.Tags[]  | select(.Key == "ghr:warm-activated") | .Value')

%{ endif }

echo "Retrieved ghr:environment tag - ($environment)"
echo "Retrieved ghr:ssm_config_path tag - ($ssm_config_path)"
echo "Retrieved ghr:runner_name_prefix tag - ($runner_name_prefix)"
echo "Retrieved ghr:warm-pool tag - ($warm_pool), ghr:warm-activated tag - ($warm_activated)"

parameters=$(aws ssm get-parameters-by-path --path "$ssm_config_path" --region "$region" --query "Parameters[*].{Name:Name,Value:Value}")
echo "Retrieved parameters from AWS SSM ($parameters)"

run_as=$(echo "$parameters" | jq -r '.[] | select(.Name == "'$ssm_config_path'/run_as") | .Value')
echo "Retrieved /$ssm_config_path/run_as parameter - ($run_as)"

enable_cloudwatch_agent=$(echo "$parameters" | jq --arg ssm_config_path "$ssm_config_path" -r '.[] | select(.Name == "'$ssm_config_path'/enable_cloudwatch") | .Value')
echo "Retrieved /$ssm_config_path/enable_cloudwatch parameter - ($enable_cloudwatch_agent)"

agent_mode=$(echo "$parameters" | jq --arg ssm_config_path "$ssm_config_path" -r '.[] | select(.Name == "'$ssm_config_path'/agent_mode") | .Value')
echo "Retrieved /$ssm_config_path/agent_mode parameter - ($agent_mode)"

disable_default_labels=$(echo "$parameters" | jq --arg ssm_config_path "$ssm_config_path" -r '.[] | select(.Name == "'$ssm_config_path'/disable_default_labels") | .Value')
echo "Retrieved /$ssm_config_path/disable_default_labels parameter - ($disable_default_labels)"

enable_jit_config=$(echo "$parameters" | jq --arg ssm_config_path "$ssm_config_path" -r '.[] | select(.Name == "'$ssm_config_path'/enable_jit_config") | .Value')
echo "Retrieved /$ssm_config_path/enable_jit_config parameter - ($enable_jit_config)"

token_path=$(echo "$parameters" | jq --arg ssm_config_path "$ssm_config_path" -r '.[] | select(.Name == "'$ssm_config_path'/token_path") | .Value')
echo "Retrieved /$ssm_config_path/token_path parameter - ($token_path)"

boot_mode=$(select_boot_mode)
echo "Selected boot mode: $boot_mode"
# An activated warm instance is single use; later reboots must not rerun the start logic.
if [[ "$boot_mode" != "PRIME" && -f /etc/systemd/system/ghr-start-runner.service ]]; then
  systemctl disable ghr-start-runner.service || true
fi

if [[ "$xray_trace_id" != "" && "$boot_mode" != "PRIME" ]]; then
  # run xray service
  curl https://s3.us-east-2.amazonaws.com/aws-xray-assets.us-east-2/xray-daemon/aws-xray-daemon-linux-3.x.zip -o aws-xray-daemon-linux-3.x.zip
  unzip aws-xray-daemon-linux-3.x.zip -d aws-xray-daemon-linux-3.x
  chmod +x ./aws-xray-daemon-linux-3.x/xray
  ./aws-xray-daemon-linux-3.x/xray -o -n "$region" &


  SEGMENT=$(create_xray_start_segment "$xray_trace_id" "$instance_id")
  echo "$SEGMENT"
fi

if [[ "$enable_cloudwatch_agent" == "true" ]]; then
  echo "Cloudwatch is enabled"
  amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c "ssm:$ssm_config_path/cloudwatch_agent_config_runner"
fi

if [[ "$boot_mode" == "PRIME" ]]; then
  install_boot_hook || exit 1
  echo "Warm pool instance primed, shutting down"
  shutdown -h now
  exit 0
fi

## Configure the runner

echo "Get GH Runner config from AWS SSM"
config=$(aws ssm get-parameter --name "$token_path"/"$instance_id" --with-decryption --region "$region" | jq -r ".Parameter | .Value")
while [[ -z "$config" ]]; do
  echo "Waiting for GH Runner config to become available in AWS SSM"
  sleep 1
  config=$(aws ssm get-parameter --name "$token_path"/"$instance_id" --with-decryption --region "$region" | jq -r ".Parameter | .Value")
done

echo "Delete GH Runner token from AWS SSM"
aws ssm delete-parameter --name "$token_path"/"$instance_id" --region "$region"

if [ -z "$run_as" ]; then
  echo "No user specified, using default ec2-user account"
  run_as="ec2-user"
fi

if [[ "$run_as" == "root" ]]; then
  echo "run_as is set to root - export RUNNER_ALLOW_RUNASROOT=1"
  export RUNNER_ALLOW_RUNASROOT=1
fi

chown -R $run_as /opt/actions-runner

info_arch=$(uname -p)
info_os=$( ( lsb_release -ds || cat /etc/*release || uname -om ) 2>/dev/null | head -n1 | cut -d "=" -f2- | tr -d '"')

tee /opt/actions-runner/.setup_info <<EOL
[
  {
    "group": "Operating System",
    "detail": "Distribution: $info_os\nArchitecture: $info_arch"
  },
  {
    "group": "Runner Image",
    "detail": "AMI id: $ami_id"
  },
  {
    "group": "EC2",
    "detail": "Instance type: $instance_type\nAvailability zone: $availability_zone"
  }
]
EOL

## Start the runner
echo "Starting runner after $(awk '{print int($1/3600)":"int(($1%3600)/60)":"int($1%60)}' /proc/uptime)"
echo "Starting the runner as user $run_as"

# configure the runner if the runner is non ephemeral or jit config is disabled
if [[ "$enable_jit_config" == "false" || $agent_mode != "ephemeral" ]]; then
  echo "Configure GH Runner as user $run_as"
  if [[ "$disable_default_labels" == "true" ]]; then
      extra_flags="--no-default-labels"
  else
      extra_flags=""
  fi
  sudo --preserve-env=RUNNER_ALLOW_RUNASROOT -u "$run_as" -- ./config.sh $${extra_flags} --unattended --name "$runner_name_prefix$instance_id" --work "_work" $${config}

  # Tag instance with GitHub runner agent ID for non-JIT runners
  tag_instance_with_runner_id
fi

log_warm_activation_latency
create_xray_success_segment "$${SEGMENT:-}"
if [[ $agent_mode = "ephemeral" ]]; then
  echo "Starting the runner in ephemeral mode"

  if [[ "$enable_jit_config" == "true" ]]; then
    echo "Starting with JIT config"
    sudo --preserve-env=RUNNER_ALLOW_RUNASROOT -u "$run_as" -- ./run.sh --jitconfig $${config}
  else
    echo "Starting without JIT config"
    sudo --preserve-env=RUNNER_ALLOW_RUNASROOT -u "$run_as" -- ./run.sh
  fi
  echo "Runner has finished"
else
  echo "Installing the runner as a service"
  ./svc.sh install "$run_as"
  echo "Starting the runner in persistent mode"
  ./svc.sh start
fi
# ghr:start-runner:end
