#!/bin/bash -e
set -e

USER_NAME=ec2-user

echo "Creating actions-runner directory for the GH Action installtion"
cd /home/"$USER_NAME"
mkdir actions-runner && cd actions-runner

file_name="actions-runner.tar.gz"
echo "Downloading the GH Action runner to $file_name"
curl -o $file_name -L https://github.com/actions/runner/releases/download/v2.284.0/actions-runner-linux-x64-2.284.0.tar.gz

# echo "1ddfd7bbd3f2b8f5684a7d88d6ecb6de3cb2281a2a359543a018cc6e177067fc  actions-runner-linux-x64-2.284.0.tar.gz" | shasum -a 256 -c
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
chown -R "$USER_NAME":"$USER_NAME" .