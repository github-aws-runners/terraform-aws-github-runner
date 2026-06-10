# shellcheck shell=bash

set -euo pipefail

## install the runner (macOS)

s3_location=${S3_LOCATION_RUNNER_DISTRIBUTION:-}
architecture=${RUNNER_ARCHITECTURE:-}
runner_tarball_url=${RUNNER_TARBALL_URL:-}
user_name=${user_name:-ec2-user}

if [ -z "$runner_tarball_url" ] && [ -z "$s3_location" ]; then
  echo "Neither RUNNER_TARBALL_URL or s3_location are set"
  exit 1
fi

file_name="actions-runner.tar.gz"

echo "Setting up GH Actions runner tool cache"
mkdir -p /Users/runner/hostedtoolcache

echo "Creating actions-runner directory for the GH Action installation"
sudo mkdir -p /opt/actions-runner
cd /opt/actions-runner || exit 1

if [[ -n "$runner_tarball_url" ]]; then
  echo "Downloading the GH Action runner from $runner_tarball_url to $file_name"
  curl -s -o "$file_name" -L "$runner_tarball_url"
else
  echo "Retrieving REGION from AWS API"
  token="$(curl -s -f -X PUT "http://169.254.169.254/latest/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 180")"

  region="$(curl -s -f -H "X-aws-ec2-metadata-token: $token" \
    http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region)"
  echo "Retrieved REGION from AWS API ($region)"

  echo "Downloading the GH Action runner from s3 bucket $s3_location"
  aws s3 cp "$s3_location" "$file_name" --region "$region" --no-progress
fi

echo "Un-tar action runner"
tar xzf "./$file_name"
echo "Delete tar file"
rm -rf "$file_name"

os_name=$(sw_vers -productName 2>/dev/null || echo "macOS")
os_version=$(sw_vers -productVersion 2>/dev/null || echo "unknown")
arch_name=$(uname -m)

echo "OS: $os_name $os_version ($arch_name)"

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew not found; skipping dependency installation via brew"
else
  echo "Homebrew detected; install any macOS-specific dependencies here if needed"
  # Example: brew install jq awscli
fi

echo "Set file ownership of action runner"
sudo chown -R "$user_name":staff /opt/actions-runner
sudo chmod 755 "/Users/runner"
sudo chown -R "$user_name":staff /Users/runner/hostedtoolcache
