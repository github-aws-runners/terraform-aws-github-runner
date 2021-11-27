#!/bin/bash -e
exec > >(tee /var/log/runner-startup.log | logger -t user-data -s 2>/dev/console) 2>&1

user_name=ec2-user

cd /home/$user_name/actions-runner

echo "Retrieving TOKEN from AWS API"
token=$(curl -f -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 180")

region=$(curl -f -H "X-aws-ec2-metadata-token: $token" -v http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region)
echo "Reteieved REGION from AWS API ($region)"

instance_id=$(curl -f -H "X-aws-ec2-metadata-token: $token" -v http://169.254.169.254/latest/meta-data/instance-id)
echo "Reteieved INSTANCE_ID from AWS API ($instance_id)"

tags=$(aws ec2 describe-tags --region "$region" --filters "Name=resource-id,Values=$instance_id")
echo "Retrieved tags from AWS API ($tags)"

environment=$(echo "$tags" | jq '.Tags[]  | select(.Key == "Environment") | .Value')
echo "Reteieved environment tag - ($environment)"

enable_cloudwatch_agent=$(echo "$tags" | jq '.Tags[]  | select(.Key == "enable_cloudwatch_agent") | .Value')
echo "Reteieved enable_cloudwatch_agent tag - ($enable_cloudwatch_agent)"

if [[ -n "$enable_cloudwatch_agent" ]]; then  
  echo "Cloudwatch is enabled"  
  amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c ssm:"$environment-cloudwatch_agent_config_runner"
fi

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

# TODO this should also be passed via tags
service_user=${RUN_AGENT_AS_USER:-$user_name}

echo "Start the runner as user $service_user"
sudo -u "$service_user" -- ./run.sh
echo "Runner has finished"

#service awslogsd stop
echo "Terminating instance"
aws ec2 terminate-instances --instance-ids "$instance_id" --region "$region"
