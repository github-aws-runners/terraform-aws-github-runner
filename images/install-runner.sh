#!/bin/bash -e
set -e

if [[ -z "$RUNNER_TARBALL_URL" ]]; then
  echo "RUNNER_TARBALL_URL is not set"
  exit 1
fi

user_name=ec2-user
file_name="actions-runner.tar.gz"

echo "Creating actions-runner directory for the GH Action installtion"
cd /home/"$user_name"
mkdir actions-runner && cd actions-runner

echo "Downloading the GH Action runner from $RUNNER_TARBALL_URL to $file_name"
curl -o $file_name -L "$RUNNER_TARBALL_URL"

echo "Un-tar action runner"
tar xzf ./$file_name
echo "Delete tar file"
rm -rf $file_name

echo "export RUNNER_ALLOW_RUNASROOT=1"
export RUNNER_ALLOW_RUNASROOT=1

os_id=$(awk -F= '/^ID/{print $2}' /etc/os-release)
if [[ "$os_id" =~ ^ubuntu.* ]]; then
    echo "Installing dependencies"
    ./bin/installdependencies.sh
fi

echo "Set file ownership of action runner"
chown -R "$user_name":"$user_name" .