# shellcheck shell=bash

## install the runner (macOS)

s3_location=${S3_LOCATION_RUNNER_DISTRIBUTION}
architecture=${RUNNER_ARCHITECTURE}

if [ -z "$RUNNER_TARBALL_URL" ] && [ -z "$s3_location" ]; then
  echo "Neither RUNNER_TARBALL_URL or s3_location are set"
  exit 1
fi

file_name="actions-runner.tar.gz"

echo "Setting up GH Actions runner tool cache"
mkdir -p /opt/hostedtoolcache

echo "Creating actions-runner directory for the GH Action installation"
sudo mkdir -p /opt/actions-runner
cd /opt/actions-runner || exit 1

if [[ -n "$RUNNER_TARBALL_URL" ]]; then
  echo "Downloading the GH Action runner from $RUNNER_TARBALL_URL to $file_name"
  curl -s -o "$file_name" -L "$RUNNER_TARBALL_URL"
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

user_name="${RUNNER_USER:-ec2-user}"

echo "Set file ownership of action runner"
sudo chown -R "$user_name":"$user_name" /opt/actions-runner
sudo chown -R "$user_name":"$user_name" /opt/hostedtoolcache
