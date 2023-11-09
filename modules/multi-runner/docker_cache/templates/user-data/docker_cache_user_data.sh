#!/bin/bash

apt-get update -y
apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release jq
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io
usermod -aG ubuntu docker
echo -e "---\n\nversion: 0.1\nlog:\n  level: info\n  fields:\n    service: registry\nstorage:\n  cache:\n    blobdescriptor: inmemory\n  filesystem:\n    rootdirectory: /var/lib/registry\nhttp:\n  addr: :5000\n  headers:\n    X-Content-Type-Options: [nosniff]\nproxy:\n  remoteurl: https://registry-1.docker.io" > /home/ubuntu/config.yml
mkdir /home/ubuntu/registry
docker run -d -p 5000:5000 --restart=always --name=through-cache -v /home/ubuntu/config.yml:/etc/docker/registry/config.yml -v /home/ubuntu/registry:/var/lib/registry registry:2
