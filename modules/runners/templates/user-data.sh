#!/bin/bash -e

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

dnf upgrade-minimal -y

# Install docker
dnf install -y docker
service docker start
usermod -a -G docker ec2-user

dnf install -y amazon-cloudwatch-agent jq git
dnf install -y --allowerasing curl

user_name=ec2-user

${install_runner}

${post_install}

${start_runner}
