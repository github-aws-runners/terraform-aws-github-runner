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

if [[ "$architecture" == "arm64" ]]; then
  yum install -y libicu60
fi

os_id=$(awk -F= '/^ID/{print $2}' /etc/os-release)
if [[ "$os_id" =~ ^ubuntu.* ]]; then
    echo "Installing dependencies"
    ./bin/installdependencies.sh
fi

echo "Set file ownership of action runner"
chown -R "$run_as":"$run_as" .
chown -R "$run_as":"$run_as" /opt/hostedtoolcache

echo "Configure GH Runner as user $run_as"
sudo --preserve-env=RUNNER_ALLOW_RUNASROOT -u "$run_as" -- ./config.sh --unattended --name "$instance_id" --work "_work" $${config}

info_arch=$(uname -p)
info_os=$(( lsb_release -ds || cat /etc/*release || uname -om ) 2>/dev/null | head -n1 | cut -d "=" -f2- | tr -d '"')

tee /opt/actions-runner/.setup_info <<EOL
[
  {
    "group": "Operating System",
    "detail": "Distribution: $info_os\nArchitecture: $info_arch"
  },
  {
    "group": "Runner Image",
    "detail": "AMI id: $ami_id"
  }
]
EOL
