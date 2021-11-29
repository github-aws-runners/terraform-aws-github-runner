# shellcheck shell=bash

## install the runner

s3_location=${S3_LOCATION_RUNNER_DISTRIBUTION}

if [ -z "$RUNNER_TARBALL_URL" ] && [ -z "$s3_location" ]; then
  echo "Neither RUNNER_TARBALL_URL or s3_location are set"
  exit 1
fi

file_name="actions-runner.tar.gz"

echo "Creating actions-runner directory for the GH Action installtion"
cd /home/"$user_name"
mkdir actions-runner && cd actions-runner


if [[ -n "$RUNNER_TARBALL_URL" ]]; then
  echo "Downloading the GH Action runner from $RUNNER_TARBALL_URL to $file_name"
  curl -o $file_name -L "$RUNNER_TARBALL_URL"
else  
  echo "Retrieving TOKEN from AWS API"
  token=$(curl -f -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 180")

  region=$(curl -f -H "X-aws-ec2-metadata-token: $token" -v http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region)
  echo "Reteieved REGION from AWS API ($region)"

  echo "Downloading the GH Action runner from s3 bucket $s3_location"
  aws s3 cp "$s3_location" "$file_name" --region "$region"
fi

echo "Un-tar action runner"
tar xzf ./$file_name
echo "Delete tar file"
rm -rf $file_name

${ARM_PATCH}

echo "export RUNNER_ALLOW_RUNASROOT=1"
export RUNNER_ALLOW_RUNASROOT=1

os_id=$(awk -F= '/^ID/{print $2}' /etc/os-release)
if [[ "$os_id" =~ ^ubuntu.* ]]; then
    echo "Installing dependencies"
    ./bin/installdependencies.sh
fi

echo "Set file ownership of action runner"
chown -R "$user_name":"$user_name" .