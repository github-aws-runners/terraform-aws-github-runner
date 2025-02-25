#!/bin/bash
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

# Install AWS CLI
apt-get -q update
DEBIAN_FRONTEND=noninteractive apt-get install -q -y \
    build-essential \
    ca-certificates \
    curl \
    git \
    iptables \
    jq \
    systemd-container \
    uidmap \
    unzip \
    wget

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get -q update
apt-get -q -y install docker-ce docker-ce-cli containerd.io docker-ce-rootless-extras docker-buildx-plugin docker-compose-plugin
systemctl disable --now docker.socket docker.service

# avoid /tmp, might be mounted no-exec
curl -fsSL -o "awscliv2.zip" "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip"
unzip -q awscliv2.zip
aws/install
rm -rf aws awscliv2.zip

user_name=ubuntu
user_id=$(id -ru $user_name)

# install and configure cloudwatch logging agent
curl -fsSL -o "/tmp/amazon-cloudwatch-agent.deb" https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
dpkg -i -E /tmp/amazon-cloudwatch-agent.deb
rm -f /tmp/amazon-cloudwatch-agent.deb
amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c "ssm:${ssm_key_cloudwatch_agent_config}"

# configure systemd for running service in users accounts
mkdir -p /etc/systemd/system/user-$user_id.slice.d
cat > /etc/systemd/system/user-$user_id.slice.d/resources.conf <<- EOF
[Slice]
TasksMax=infinity
EOF
mkdir -p /home/$user_name/.config/systemd/
cat > /home/$user_name/.config/systemd/user.conf <<- EOF
[Manager]
DefaultLimitNOFILE=infinity
DefaultLimitNPROC=infinity
EOF
chown $user_name:$user_name /home/$user_name/.config/systemd/user.conf /home/$user_name/.config/systemd /home/$user_name/.config/

systemctl daemon-reload

echo export XDG_RUNTIME_DIR="/run/user/$user_id" >> "/home/$user_name/.bashrc"

# Run docker service by default
loginctl enable-linger $user_name
machinectl shell "$user_name@.host" /usr/bin/dockerd-rootless-setuptool.sh install
echo export DOCKER_HOST="unix:///run/user/$user_id/docker.sock" >> "/home/$user_name/.bashrc"
echo export PATH="/home/$user_name/bin:$PATH" >> "/home/$user_name/.bashrc"

${install_runner}

# config runner for rootless docker
cd /opt/actions-runner/
echo DOCKER_HOST="unix:///run/user/$user_id/docker.sock" >> .env
echo PATH="/home/$user_name/bin:$PATH" >> .env

${post_install}

cd /opt/actions-runner

%{ if hook_job_started != "" }
cat > /opt/actions-runner/hook_job_started.sh <<'EOF'
${hook_job_started}
EOF
echo ACTIONS_RUNNER_HOOK_JOB_STARTED=/opt/actions-runner/hook_job_started.sh | tee -a /opt/actions-runner/.env
%{ endif }

%{ if hook_job_completed != "" }
cat > /opt/actions-runner/hook_job_completed.sh <<'EOF'
${hook_job_completed}
EOF
echo ACTIONS_RUNNER_HOOK_JOB_COMPLETED=/opt/actions-runner/hook_job_completed.sh | tee -a /opt/actions-runner/.env
%{ endif }

${start_runner}
