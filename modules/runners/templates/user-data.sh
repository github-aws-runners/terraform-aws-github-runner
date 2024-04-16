#!/bin/bash -e

install_with_retry() {
  max_attempts=5
  attempt_count=0
  success=false
  while [ $success = false ] && [ $attempt_count -le $max_attempts ]; do
    echo "Attempting $attempt_count/$max_attempts: Installing $*"
    dnf install -y $*
  if [ $? -eq 0 ]; then
      success=true
    else
      echo "Failed to install $1 - retrying"
      attempt_count=$(( attempt_count + 1 ))
      sleep 5
    fi
  done
}

exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1

# AWS suggest to create a log for debug purpose based on https://aws.amazon.com/premiumsupport/knowledge-center/ec2-linux-log-user-data/
# As side effect all command, set +x disable debugging explicitly.
#
# An alternative for masking tokens could be: exec > >(sed 's/--token\ [^ ]* /--token\ *** /g' > /var/log/user-data.log) 2>&1

set +x

%{ if enable_debug_logging }
set -x
%{ endif }

${pre_install}

max_attempts=5
attempt_count=0
success=false
while [ $success = false ] && [ $attempt_count -le $max_attempts ]; do
  echo "Attempting $attempt_count/$max_attempts: upgrade-minimal"
  dnf upgrade-minimal -y
if [ $? -eq 0 ]; then
    success=true
  else
    echo "Failed to run `dnf upgrad-minimal -y` - retrying"
    attempt_count=$(( attempt_count + 1 ))
    sleep 5
  fi
done

# Install docker
install_with_retry docker

service docker start
usermod -a -G docker ec2-user

install_with_retry amazon-cloudwatch-agent jq git
install_with_retry --allowerasing curl

user_name=ec2-user

${install_runner}

${post_install}

${start_runner}
