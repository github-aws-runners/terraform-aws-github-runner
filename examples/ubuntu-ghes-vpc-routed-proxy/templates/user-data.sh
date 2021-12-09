#!/bin/bash -e
#
# This script is executed as root at VM start
#

# Last version available on: https://api.github.com/repos/actions/runner/releases/latest
RUNNER_VERSION=2.285.1

# User for installing GitHub Action Runner
USER_NAME=ubuntu

exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1

# Retrieve VM instance id
TOKEN_AWS_METADATA=$(curl -fs -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 180")
REGION=$(curl -fs -H "X-aws-ec2-metadata-token: $TOKEN_AWS_METADATA" http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region)
INSTANCE_ID=$(curl -fs -H "X-aws-ec2-metadata-token: $TOKEN_AWS_METADATA" http://169.254.169.254/latest/meta-data/instance-id)

echo "Runner version: $RUNNER_VERSION"
echo "AWS InstanceId: $INSTANCE_ID"
echo "AWS Region    : $REGION"
echo ""

cd /home/$USER_NAME
mkdir -p actions-runner && cd actions-runner

# Optionally if runner not installed on VM
# Install runner from a company private repository, accessible from corporate network
# Here a sample with Artifactory where GitHub.com is configured as generic remote repository
echo "Downloading and extracting GitHub Action Runner..."
wget -q -O actions-runner.tar.gz http://artifactory.company.com/generic-remote-github/actions/runner/releases/download/v$RUNNER_VERSION/actions-runner-linux-x64-$RUNNER_VERSION.tar.gz
tar xzf ./actions-runner.tar.gz
rm -rf actions-runner.tar.gz

echo "Configuring directory permission..."
chown -R $USER_NAME:$USER_NAME .

# Delete SSM parameter (will be used one day when runner at enterprise level will be implemented, requires GHES v3.3)
# Proxy should be configured propertly, let access to instance metadata
echo "Retrieving SSM parameter for instance and delete it..."
export http_proxy=${http_proxy}
export https_proxy=${http_proxy}
export no_proxy=169.254.169.254
while [[ $(aws ssm get-parameters --names ${environment}-$INSTANCE_ID --with-decryption --region $REGION | jq -r ".Parameters | .[0] | .Value") == null ]]; do
    echo "Waiting for configuration ..."
    sleep 1
done
CONFIG=$(aws ssm get-parameters --names ${environment}-$INSTANCE_ID --with-decryption --region $REGION | jq -r ".Parameters | .[0] | .Value")
aws ssm delete-parameter --name ${environment}-$INSTANCE_ID --region $REGION
unset http_proxy
unset https_proxy
unset no_proxy

echo "Getting a runner registration token..."
ENTERPRISE=${pre_install}
ADMIN_PAT=${post_install}
TOKEN_REGISTRATION=$(curl -fs -X POST -u token:$ADMIN_PAT -H "Accept: application/vnd.github.v3+json" ${ghes_url}/api/v3/enterprises/$ENTERPRISE/actions/runners/registration-token | jq -r ".token")

echo "Configuring GitHub Action Runner..."
#sudo -iu $USER_NAME bash -c "cd actions-runner && ./config.sh --unattended --name $INSTANCE_ID --work _work $CONFIG"
sudo -iu $USER_NAME bash -c "cd actions-runner && ./config.sh --unattended --name $INSTANCE_ID --labels ubuntu,ubuntu-latest,ubuntu-20.04 --runnergroup Default --url ${ghes_url}/enterprises/$ENTERPRISE --token $TOKEN_REGISTRATION"

# Details: https://github.com/actions/runner/issues/1242
echo "Populating GitHub Action Runner '.env' file with $USER_NAME profile variables..."
sudo -iu $USER_NAME cat /home/$USER_NAME/.profile | grep export | grep -v PATH | sed 's/export //g' | sed 's/"//g' | envsubst >> /home/$USER_NAME/actions-runner/.env

echo "Populating GitHub Action Runner '.path' file with $USER_NAME PATH..."
sudo -iu $USER_NAME bash -c 'echo $PATH' > /home/$USER_NAME/actions-runner/.path

echo "Installing as service..."
./svc.sh install $USER_NAME

echo "Starting as service..."
./svc.sh start

echo "Deleting this script on VM which could contain some sensitive data..."
sudo rm /var/lib/cloud/instance/scripts/part-001

echo ""
echo ""
echo "Process end successfully, new runner should be visible on: ${ghes_url}/enterprises/$ENTERPRISE/settings/actions/runners"
echo ""