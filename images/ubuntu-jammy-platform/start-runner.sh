#!/bin/bash -e
exec > >(tee /var/log/runner-startup.log | logger -t user-data -s 2>/dev/console) 2>&1

echo "Initializing NVMe Instance Store for Docker"
sudo systemctl stop docker
sudo mkdir -p /mnt/instance-store
sudo mkfs -t xfs /dev/nvme1n1
sudo mount /dev/nvme1n1 /mnt/instance-store
sudo touch /etc/docker/daemon.json
sudo sed -i '1s/{$/{\n  "data-root": "\/mnt\/instance-store",/' /etc/docker/daemon.json
sudo systemctl start docker
echo "Initialized NVMe Instance Store for Docker"

cd /opt/actions-runner

## This wrapper file re-uses scripts in the /modules/runners/templates directory
## of this repo. These are the same that are used by the user_data functionality
## to bootstrap the instance if it is started from an existing AMI.
${start_runner}
