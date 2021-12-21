# shellcheck shell=bash

## Retrieve instance metadata

echo "Retrieving TOKEN from AWS API"
token=$(curl -f -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 180")

region=$(curl -f -H "X-aws-ec2-metadata-token: $token" -v http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region)
echo "Reteieved REGION from AWS API ($region)"

instance_id=$(curl -f -H "X-aws-ec2-metadata-token: $token" -v http://169.254.169.254/latest/meta-data/instance-id)
echo "Reteieved INSTANCE_ID from AWS API ($instance_id)"

tags=$(aws ec2 describe-tags --region "$region" --filters "Name=resource-id,Values=$instance_id")
echo "Retrieved tags from AWS API ($tags)"

environment=$(echo "$tags" | jq -r '.Tags[]  | select(.Key == "ghr:environment") | .Value')
echo "Reteieved ghr:environment tag - ($environment)"

parameters=$(aws ssm get-parameters-by-path --path "/$environment/runner" --region "$region" --query "Parameters[*].{Name:Name,Value:Value}")
echo "Retrieved parameters from AWS SSM ($parameters)"

run_as=$(echo "$parameters" | jq --arg environment "$environment" -r '.[] | select(.Name == "/\($environment)/runner/run-as") | .Value')
echo "Retrieved /$environment/runner/run-as parameter - ($run_as)"

enable_cloudwatch_agent=$(echo "$parameters" | jq --arg environment "$environment" -r '.[] | select(.Name == "/\($environment)/runner/enable-cloudwatch") | .Value')
echo "Retrieved /$environment/runner/enable-cloudwatch parameter - ($enable_cloudwatch_agent)"

agent_mode=$(echo "$parameters" | jq --arg environment "$environment" -r '.[] | select(.Name == "/\($environment)/runner/agent-mode") | .Value')
echo "Retrieved /$environment/runner/agent-mode parameter - ($agent_mode)"

if [[ -n "$enable_cloudwatch_agent" ]]; then  
  echo "Cloudwatch is enabled"  
  amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c "ssm:$environment-cloudwatch_agent_config_runner"
fi


## Configure the runner

echo "Get GH Runner config from AWS SSM"
config=$(aws ssm get-parameters --names "$environment"-"$instance_id" --with-decryption --region "$region" | jq -r ".Parameters | .[0] | .Value")

while [[ -z "$config" ]]; do
  echo "Waiting for GH Runner config to become available in AWS SSM"
  sleep 1
  config=$(aws ssm get-parameters --names "$environment"-"$instance_id" --with-decryption --region "$region" | jq -r ".Parameters | .[0] | .Value")
done

echo "Delete GH Runner token from AWS SSM"
aws ssm delete-parameter --name "$environment"-"$instance_id" --region "$region"

if [ -z "$run_as" ]; then
    echo "No user specified, using default ec2-user account"
    run_as="ec2-user"
fi

if [[ "$run_as" == "root" ]]; then
    export RUNNER_ALLOW_RUNASROOT=1
fi

echo "Configure GH Runner as user $run_as"
sudo --preserve-env=RUNNER_ALLOW_RUNASROOT -u "$run_as" -- ./config.sh --unattended --name "$instance_id" --work "_work" $${config}

## Start the runner
echo "Starting runner after $(awk '{print int($1/3600)":"int(($1%3600)/60)":"int($1%60)}' /proc/uptime)"
echo "Starting the runner as user $run_as"

if [[ $agent_mode = "ephemeral" ]]; then  
  echo "Starting the runner in ephemeral mode"
  sudo --preserve-env=RUNNER_ALLOW_RUNASROOT -u "$run_as" -- ./run.sh
  echo "Runner has finished"
  
  echo "Stopping cloudwatch service"
  service awslogsd stop
  echo "Terminating instance"
  aws ec2 terminate-instances --instance-ids "$instance_id" --region "$region"
else 
  echo "Installing the runner as a service"
  ./svc.sh install "$run_as"
  echo "Starting the runner in persistent mode"
  ./svc.sh start
fi