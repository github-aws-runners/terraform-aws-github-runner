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

environment=$(echo "$tags" | jq '.Tags[]  | select(.Key == "ghr:environment") | .Value')
echo "Reteieved ghr:environment tag - ($environment)"

enable_cloudwatch_agent=$(echo "$tags" | jq '.Tags[]  | select(.Key == "ghr:enable_cloudwatch") | .Value')
echo "Reteieved ghr:enable_cloudwatch tag - ($enable_cloudwatch_agent)"

run_as=$(echo "$tags" | jq '.Tags[]  | select(.Key == "ghr:_run_as") | .Value')
echo "Reteieved ghr:run_as tag - ($run_as)"

agent_mode=$(echo "$tags" | jq '.Tags[]  | select(.Key == "ghr:agent_mode") | .Value')
echo "Reteieved ghr:agent_mode tag - ($agent_mode)"

if [[ -n "$enable_cloudwatch_agent" ]]; then  
  echo "Cloudwatch is enabled"  
  amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c ssm:"$environment-cloudwatch_agent_config_runner"
fi


## Configure the runner

echo "Get GH Runner token from AWS SSM"
config=$(aws ssm get-parameters --names "$environment"-"$instance_id" --with-decryption --region "$region" | jq -r ".Parameters | .[0] | .Value")

while [[ -z "$config" ]]; do
  echo "Waiting for GH Runner token to become available in AWS SSM"
  sleep 1
  config=$(aws ssm get-parameters --names "$environment"-"$instance_id" --with-decryption --region "$region" | jq -r ".Parameters | .[0] | .Value")
done

echo "Delete GH Runner token from AWS SSM"
aws ssm delete-parameter --name "$environment"-"$instance_id" --region "$region"

echo "Configure GH Runner"
./config.sh --unattended --name "$instance_id" --work "_work" "$config"


## Start the runner


if [ -z "$run_as" ]; then
    run_as="ec2-user"
fi
echo "Starting the runner as user $run_as"

if [[ $agent_mode = "ephemeral" ]]; then  
  echo "Starting the runner in ephemeral mode"
  sudo -u "$run_as" -- ./run.sh
  echo "Runner has finished"

  #TODO is this line needed?
  #service awslogsd stop
  echo "Terminating instance"
  aws ec2 terminate-instances --instance-ids "$instance_id" --region "$region"
else 
  echp "Installing the runner as a service"
  ./svc.sh install "$run_as"
  echo "Starting the runner in persistent mode"
  ./svc.sh start
fi