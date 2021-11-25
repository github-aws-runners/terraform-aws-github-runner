#!/bin/bash -e

%{ if enable_cloudwatch_agent ~}
amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c ssm:${ssm_key_cloudwatch_agent_config}
%{ endif ~}


cd /home/$USER_NAME/actions-runner

TOKEN=$(curl -f -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 180")
REGION=$(curl -f -H "X-aws-ec2-metadata-token: $TOKEN" -v http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region)
INSTANCE_ID=$(curl -f -H "X-aws-ec2-metadata-token: $TOKEN" -v http://169.254.169.254/latest/meta-data/instance-id)

echo wait for configuration
while [[ $(aws ssm get-parameters --names ${environment}-$INSTANCE_ID --with-decryption --region $REGION | jq -r ".Parameters | .[0] | .Value") == null ]]; do
    echo Waiting for configuration ...
    sleep 1
done
CONFIG=$(aws ssm get-parameters --names ${environment}-$INSTANCE_ID --with-decryption --region $REGION | jq -r ".Parameters | .[0] | .Value")
aws ssm delete-parameter --name ${environment}-$INSTANCE_ID --region $REGION

export RUNNER_ALLOW_RUNASROOT=1
os_id=$(awk -F= '/^ID/{print $2}' /etc/os-release)
if [[ "$os_id" =~ ^ubuntu.* ]]; then
    ./bin/installdependencies.sh
fi

./config.sh --unattended --name $INSTANCE_ID --work "_work" $CONFIG

chown -R $USER_NAME:$USER_NAME .
OVERWRITE_SERVICE_USER=${run_as_root_user}
SERVICE_USER=$${OVERWRITE_SERVICE_USER:-$USER_NAME}



# TODO: svc.sh start replaced by run.sh and once stopped / exitted the instance terminated
sudo -u $SERVICE_USER -- ./run.sh
#service awslogsd stop

aws ec2 terminate-instances --instance-ids $INSTANCE_ID --region $REGION
