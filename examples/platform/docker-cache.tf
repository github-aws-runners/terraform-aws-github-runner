data "aws_ami" "docker_cache_ami" {
  most_recent = false

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-arm64-server-20230601"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  owners = ["099720109477"] # Canonical
}

data "aws_security_group" "runner_sg" {
  tags = {
    "ghr:environment" = local.environment
  }
}

resource "aws_security_group" "docker_cache_sg" {
  name_prefix = "${local.environment}-docker-cache-sg"
  vpc_id = module.base.vpc.vpc_id
  tags = {
    Name = "docker-cache-sg"
  }
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  security_group_id = aws_security_group.docker_cache_sg.id
  # description =
  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "tcp"
  from_port   = 22
  to_port     = 22
}

resource "aws_vpc_security_group_ingress_rule" "docker" {
  security_group_id = aws_security_group.docker_cache_sg.id
  # description =
  referenced_security_group_id = data.aws_security_group.runner_sg.id
  ip_protocol = "tcp"
  from_port   = 443
  to_port     = 443
}

resource "aws_route53_zone" "private" {
  name = "platform.internal"
  vpc {
    vpc_id = module.base.vpc.vpc_id
  }
}

resource "aws_route53_record" "docker_cache" {
  zone_id = aws_route53_zone.private.zone_id
  name    = "docker-cache.platform.internal"
  type    = "A"
  ttl     = 300
  records = [aws_instance.docker_cache.private_ip]
}

resource "aws_instance" "docker_cache" {
  ami = data.aws_ami.docker_cache_ami.id
  instance_type = "t4g.micro"

  subnet_id = module.base.vpc.private_subnets[0]
  vpc_security_group_ids = [
    data.aws_security_group.runner_sg.id,
    aws_security_group.docker_cache_sg.id
  ]

  # TODO: Implement SSM
  # iam_instance_profile =

  # Uncomment for debug access
  # key_name = "dashdev.rsa"
  # associate_public_ip_address = true

  user_data_replace_on_change = true
  user_data                   = <<-EOF
                                #!/bin/bash
                                apt-get update -y
                                apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
                                curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
                                echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
                                apt-get update -y
                                apt-get install -y docker-ce docker-ce-cli containerd.io
                                usermod -aG ubuntu docker
                                echo -e "---\n\nversion: 0.1\nlog:\n  level: info\n  fields:\n    service: registry\nstorage:\n  cache:\n    blobdescriptor: inmemory\n  filesystem:\n    rootdirectory: /var/lib/registry\nhttp:\n  addr: :5000\n  headers:\n    X-Content-Type-Options: [nosniff]\nproxy:\n  remoteurl: https://registry-1.docker.io" > /home/ubuntu/config.yml
                                mkdir /home/ubuntu/registry
                                docker run -d -p 443:5000 --restart=always --name=through-cache -v /home/ubuntu/config.yml:/etc/docker/registry/config.yml -v /home/ubuntu/registry:/var/lib/registry registry:2
                                EOF

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
  }

  tags = {
    Name = "platform-docker-cache-tf"
  }
}
