#!/bin/bash -x
exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1

${pre_install}

# Install AWS CLI
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
    awscli \
    build-essential \
    curl \
    git \
    iptables \
    jq \
    uidmap \
    unzip \
    wget

user_name=ubuntu
user_id=$(id -ru $user_name)

# install and configure cloudwatch logging agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
dpkg -i -E ./amazon-cloudwatch-agent.deb
amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c ssm:${ssm_key_cloudwatch_agent_config}

# configure systemd for running service in users accounts
cat >/etc/systemd/user@UID.service <<-EOF

[Unit]
Description=User Manager for UID %i
After=user-runtime-dir@%i.service
Wants=user-runtime-dir@%i.service

[Service]
LimitNOFILE=infinity
LimitNPROC=infinity
User=%i
PAMName=systemd-user
Type=notify

[Install]
WantedBy=default.target

EOF

echo export XDG_RUNTIME_DIR=/run/user/$user_id >>/home/$user_name/.bashrc

systemctl daemon-reload
systemctl enable user@UID.service
systemctl start user@UID.service

curl -fsSL https://get.docker.com/rootless >>/opt/rootless.sh && chmod 755 /opt/rootless.sh
su -l $user_name -c /opt/rootless.sh
echo export DOCKER_HOST=unix:///run/user/$user_id/docker.sock >>/home/$user_name/.bashrc
echo export PATH=/home/$user_name/bin:$PATH >>/home/$user_name/.bashrc

# Run docker service by default
loginctl enable-linger $user_name
su -l $user_name -c "systemctl --user enable docker"

${install_runner}

# config runner for rootless docker
cd /opt/actions-runner/
echo DOCKER_HOST=unix:///run/user/$user_id/docker.sock >>.env
echo PATH=/home/$user_name/bin:$PATH >>.env

${post_install}

cd /opt/actions-runner

${start_runner}
