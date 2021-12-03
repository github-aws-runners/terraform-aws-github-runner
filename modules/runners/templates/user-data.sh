#!/bin/bash -e
exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1

${pre_install}

yum update -y

# Install docker
amazon-linux-extras install docker
service docker start
usermod -a -G docker ec2-user

yum install -y amazon-cloudwatch-agent curl jq git

user_name=ec2-user

${install_runner}

${post_install}

${start_runner}
