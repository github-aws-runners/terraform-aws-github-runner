#!/bin/bash

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

cleanup() {
  local exit_code="$1"
  local error_location="$2"
  local error_lineno="$3"

  if [ "$exit_code" -ne 0 ]; then
    echo "ERROR: runner-start-failed with exit code $exit_code occurred on $error_location"
    create_xray_error_segment "$SEGMENT" "runner-start-failed with exit code $exit_code occurred on $error_location - $error_lineno"
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

%{ else }
tags=$(aws ec2 describe-tags --region "$region" --filters "Name=resource-id,Values=$instance_id")
echo "Retrieved tags from AWS API ($tags)"

environment=$(echo "$tags" | jq -r '.Tags[]  | select(.Key == "ghr:environment") | .Value')
ssm_config_path=$(echo "$tags" | jq -r '.Tags[]  | select(.Key == "ghr:ssm_config_path") | .Value')
runner_name_prefix=$(echo "$tags" | jq -r '.Tags[]  | select(.Key == "ghr:runner_name_prefix") | .Value' || echo "")
xray_trace_id=$(echo "$tags" | jq -r '.Tags[]  | select(.Key == "ghr:trace_id") | .Value' || echo "")

%{ endif }

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
enable_cloudwatch_agent="${enable_cloudwatch_agent}"
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
%{ endif }

if [[ "$xray_trace_id" != "" ]]; then
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

## Configure the runner

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

create_xray_success_segment "$SEGMENT"
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
