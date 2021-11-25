#!/bin/bash -e

user_name=ec2-user

if [[ -z "$ENVIRONMENT" ]]; then
  echo "ENVIRONMENT is not set"
  exit 1
fi

if [[ -n "$ENABLE_CLOUDWATCH_AGENT" ]]; then
  if [[ -z "$SSM_KEY_CLOUDWATCH_AGENT_CONFIG" ]]; then
    echo "Cloudwatch is enabled with ENABLE_CLOUDWATCH_AGENT but SSM_KEY_CLOUDWATCH_AGENT_CONFIG is not set"
    exit 1
  fi
  echo "Cloudwatch is enabled"
  amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c ssm:"$SSM_KEY_CLOUDWATCH_AGENT_CONFIG"
fi

cd /home/$user_name/actions-runner

echo "Retrieving TOKEN from AWS API"
token=$(curl -f -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 180")

echo "Retrieving REGION from AWS API"
region=$(curl -f -H "X-aws-ec2-metadata-token: $token" -v http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region)

echo "Retrieving INSTANCE_ID from AWS API"
instance_id=$(curl -f -H "X-aws-ec2-metadata-token: $token" -v http://169.254.169.254/latest/meta-data/instance-id)

echo "Get GH Runner token from AWS SSM"
config=$(aws ssm get-parameters --names "$ENVIRONMENT"-"$instance_id" --with-decryption --region "$region" | jq -r ".Parameters | .[0] | .Value")

while [[ -z "$config" ]]; do
  echo "Waiting for GH Runner token to become available in AWS SSM"
  sleep 1
  config=$(aws ssm get-parameters --names "$ENVIRONMENT"-"$instance_id" --with-decryption --region "$region" | jq -r ".Parameters | .[0] | .Value")
done

echo "Delete GH Runner token from AWS SSM"
aws ssm delete-parameter --name "$ENVIRONMENT"-"$instance_id" --region "$region"

echo "Configure GH Runner"
./config.sh --unattended --name "$instance_id" --work "_work" "$config"

service_user=${RUN_AGENT_AS_USER:-$user_name}

echo "Start the runner as user $service_user"
sudo -u "$service_user" -- ./run.sh
echo "Runner has finished"

#service awslogsd stop
echo "Terminating instance"
aws ec2 terminate-instances --instance-ids "$instance_id" --region "$region"
