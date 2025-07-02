# shellcheck shell=bash

## install the runner

s3_location=${S3_LOCATION_RUNNER_DISTRIBUTION}
architecture=${RUNNER_ARCHITECTURE}

if [ -z "$RUNNER_TARBALL_URL" ] && [ -z "$s3_location" ]; then
  echo "Neither RUNNER_TARBALL_URL or s3_location are set"
  exit 1
fi

file_name="actions-runner.tar.gz"

echo "Setting up GH Actions runner tool cache"
# Required for various */setup-* actions to work, location is also know by various environment
# variable names in the actions/runner software : RUNNER_TOOL_CACHE / RUNNER_TOOLSDIRECTORY / AGENT_TOOLSDIRECTORY
# Warning, not all setup actions support the env vars and so this specific path must be created regardless
mkdir -p /opt/hostedtoolcache

echo "Creating actions-runner directory for the GH Action installation"
cd /opt/
mkdir -p actions-runner && cd actions-runner


if [[ -n "$RUNNER_TARBALL_URL" ]]; then
  echo "Downloading the GH Action runner from $RUNNER_TARBALL_URL to $file_name"
  curl -o $file_name -L "$RUNNER_TARBALL_URL"
else
  echo "Retrieving TOKEN from AWS API"
  token=$(curl -f -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 180")

  region=$(curl -f -H "X-aws-ec2-metadata-token: $token" -v http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region)
  echo "Retrieved REGION from AWS API ($region)"

  echo "Downloading the GH Action runner from s3 bucket $s3_location"
  aws s3 cp "$s3_location" "$file_name" --region "$region"
fi

echo "Un-tar action runner"
tar xzf ./$file_name
echo "Delete tar file"
rm -rf $file_name

os_id=$(awk -F= '/^ID=/{print $2}' /etc/os-release)
echo OS: $os_id

# Install libicu on non-ubuntu
if [[ ! "$os_id" =~ ^ubuntu.* ]]; then
  max_attempts=5
  attempt_count=0
  success=false
  while [ $success = false ] && [ $attempt_count -le $max_attempts ]; do
    echo "Attempt $attempt_count/$max_attempts: Installing libicu"
    dnf install -y libicu
    if [ $? -eq 0 ]; then
      success=true
    else
      echo "Failed to install libicu"
      attempt_count=$(( attempt_count + 1 ))
      sleep 5
    fi
  done
fi

# Install dependencies for ubuntu
if [[ "$os_id" =~ ^ubuntu.* ]]; then
    echo "Installing dependencies"
    ./bin/installdependencies.sh
fi

echo "Set file ownership of action runner"
chown -R "$user_name":"$user_name" /opt/actions-runner
chown -R "$user_name":"$user_name" /opt/hostedtoolcache
