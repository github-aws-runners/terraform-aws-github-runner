#!/bin/bash -e

export DEBIAN_FRONTEND=noninteractive
DPKG_ARCH=$(dpkg --print-architecture) # amd64/arm64
UNAME_ARCH=$(uname -m) # x86_64/aarch64

# Enable retry logic for apt up to 10 times
echo "APT::Acquire::Retries \"10\";" > /etc/apt/apt.conf.d/80-retries

# Configure apt to always assume Y
echo "APT::Get::Assume-Yes \"true\";" > /etc/apt/apt.conf.d/90-assumeyes

echo 'session required pam_limits.so' >> /etc/pam.d/common-session
echo 'session required pam_limits.so' >> /etc/pam.d/common-session-noninteractive
echo 'DefaultLimitNOFILE=65536' >> /etc/systemd/system.conf
echo 'DefaultLimitSTACK=16M:infinity' >> /etc/systemd/system.conf

# Raise Number of File Descriptors
echo '* soft nofile 65536' >> /etc/security/limits.conf
echo '* hard nofile 65536' >> /etc/security/limits.conf

# Double stack size from default 8192KB
echo '* soft stack 16384' >> /etc/security/limits.conf
echo '* hard stack 16384' >> /etc/security/limits.conf

apt -y update
apt-get -y install apt-transport-https ca-certificates software-properties-common
# https://github.com/ilikenwf/apt-fast
add-apt-repository ppa:apt-fast/stable
apt-get -y update
apt-get -y install apt-fast
# essentials
apt-get -y install curl gnupg lsb-release jq git zip unzip curl wget net-tools dnsutils
# toolchain
apt-get -y install build-essential autoconf automake cmake pkg-config
# python stuff
apt-get -y install --no-install-recommends python3 python3-pip python3-venv python-is-python3
# CI tools
apt-get -y install --no-install-recommends gitlint shellcheck shelltestrunner

# docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo deb [arch=$DPKG_ARCH signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable > /etc/apt/sources.list.d/docker.list
apt-get -y update
apt-get -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
cat << EOF > /usr/bin/docker-compose
#!/bin/sh
docker compose "\$@"
EOF
chmod +x /usr/bin/docker-compose
systemctl enable --now containerd.service
systemctl enable --now docker.service
usermod -a -G docker ubuntu
cat << EOF >> /etc/docker/daemon.json
{
   "data-root": "/data/docker"
}
EOF

# k8s tools
# delete symlink to /var/lib/kubelet/kubeconfig (owned by root) installed by AWS
rm -f /home/ubuntu/.kube/config
curl -fsSLO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-$DPKG_ARCH
install minikube-linux-$DPKG_ARCH /usr/local/bin/minikube
curl -fsSLO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/$DPKG_ARCH/kubectl"
curl -fsSLO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/$DPKG_ARCH/kubectl.sha256"
echo "$(<kubectl.sha256) kubectl" | sha256sum --check
install kubectl /usr/local/bin/kubectl

curl -fsSL https://baltocdn.com/helm/signing.asc | gpg --dearmor -o /usr/share/keyrings/helm.gpg
echo "deb [arch=$DPKG_ARCH signed-by=/usr/share/keyrings/helm.gpg] https://baltocdn.com/helm/stable/debian/ all main" > /etc/apt/sources.list.d/helm-stable-debian.list
apt-get -y update && apt-get -y install helm

# java
curl -fsSL https://apt.corretto.aws/corretto.key | gpg --dearmor -o /usr/share/keyrings/corretto.key
echo "deb [arch=$DPKG_ARCH signed-by=/usr/share/keyrings/corretto.key] https://apt.corretto.aws stable main" > /etc/apt/sources.list.d/corretto.list
apt-get -y update && apt-get -y install java-11-amazon-corretto-jdk maven

# aws tools
wget -q https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/$DPKG_ARCH/latest/amazon-cloudwatch-agent.deb -O /tmp/amazon-cloudwatch-agent.deb
apt install /tmp/amazon-cloudwatch-agent.deb

wget -q https://awscli.amazonaws.com/awscli-exe-linux-$UNAME_ARCH.zip -O /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp
/tmp/aws/install

SSM_ARCH=
case "$DPKG_ARCH" in
 amd64) SSM_ARCH=64bit ;;
 arm64) SSM_ARCH=arm64 ;;
esac

wget -q https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_$SSM_ARCH/session-manager-plugin.deb -O /tmp/session-manager-plugin.deb
apt install /tmp/session-manager-plugin.deb

# github cli
wget -q https://github.com/cli/cli/releases/download/v2.33.0/gh_2.33.0_linux_$DPKG_ARCH.deb -O /tmp/gh.deb
apt install /tmp/gh.deb

# yq
wget -q https://github.com/mikefarah/yq/releases/latest/download/yq_linux_$DPKG_ARCH -O /tmp/yq
mv /tmp/yq /usr/bin/yq
chmod +x /usr/bin/yq

systemctl restart snapd.socket
systemctl restart snapd
snap set system refresh.hold="$(date --date='today+60 days' +%Y-%m-%dT%H:%M:%S%:z)"

# Stop and disable apt-daily upgrade services;
systemctl stop apt-daily.timer
systemctl disable apt-daily.timer
systemctl disable apt-daily.service
systemctl stop apt-daily-upgrade.timer
systemctl disable apt-daily-upgrade.timer
systemctl disable apt-daily-upgrade.service

apt-get purge unattended-upgrades

# clean up
journalctl --rotate
journalctl --vacuum-time=1s

# delete all .gz and rotated file
find /var/log -type f -regex ".*\.gz$" -delete
find /var/log -type f -regex ".*\.[0-9]$" -delete

# wipe log files
find /var/log/ -type f -exec cp /dev/null {} \;
