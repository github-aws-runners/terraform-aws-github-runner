packer {
  required_plugins {
    amazon = {
      version = ">= 0.0.2"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

variable "runner_version" {
  description = "The version (no v prefix) of the runner software to install https://github.com/actions/runner/releases"
  type        = string
  default     = "2.286.0"
}

variable "region" {
  description = "The region to build the image in"
  type        = string
  default     = "eu-west-1"
}

variable "security_group_id" {
  description = "The ID of the security group Packer will associate with the builder to enable access"
  type        = string
  default     = null
}

variable "subnet_id" {
  description = "If using VPC, the ID of the subnet, such as subnet-12345def, where Packer will launch the EC2 instance. This field is required if you are using an non-default VPC"
  type        = string
  default     = null
}

variable "instance_type" {
  description = "The instance type Packer will use for the builder"
  type        = string
  default     = "m3.medium"
}

variable "root_volume_size_gb" {
  type    = number
  default = 8
}

variable "tags" {
  description = "Additional tags to add globally"
  type        = map(string)
  default     = {}
}

source "amazon-ebs" "githubrunner" {
  ami_name          = "github-runner-amzn2-x86_64-${formatdate("YYYYMMDDhhmm", timestamp())}"
  instance_type     = var.instance_type
  region            = var.region
  security_group_id = var.security_group_id
  subnet_id         = var.subnet_id
  source_ami_filter {
    filters = {
      name                = "amzn2-ami-hvm-2.*-x86_64-ebs"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["137112412989"]
  }
  ssh_username = "ec2-user"
  tags = merge(
    var.tags,
    {
      OS_Version    = "amzn2"
      Release       = "Latest"
      Base_AMI_Name = "{{ .SourceAMIName }}"
  })

  launch_block_device_mappings {
    device_name = "/dev/xvda"
    volume_size = "${var.root_volume_size_gb}"
    volume_type = "gp3"
  }
}

build {
  name = "githubactions-runner"
  sources = [
    "source.amazon-ebs.githubrunner"
  ]
  provisioner "shell" {
    environment_vars = []
    inline = [
      "sudo yum update -y",
      "sudo yum install -y amazon-cloudwatch-agent curl jq git",
      "sudo amazon-linux-extras install docker",
      "sudo systemctl enable docker.service",
      "sudo systemctl enable containerd.service",
      "sudo service docker start",
      "sudo usermod -a -G docker ec2-user",
    ]
  }

  provisioner "file" {
    content = templatefile("../install-runner.sh", {
      install_runner = templatefile("../../modules/runners/templates/install-runner.sh", {
        ARM_PATCH                       = ""
        S3_LOCATION_RUNNER_DISTRIBUTION = ""
        RUNNER_ARCHITECTURE             = "x64"
      })
    })
    destination = "/tmp/install-runner.sh"
  }

  provisioner "shell" {
    environment_vars = [
      "RUNNER_TARBALL_URL=https://github.com/actions/runner/releases/download/v${var.runner_version}/actions-runner-linux-x64-${var.runner_version}.tar.gz"
    ]
    inline = [
      "sudo chmod +x /tmp/install-runner.sh",
      "sudo RUNNER_ARCHITECTURE=x64 RUNNER_TARBALL_URL=$RUNNER_TARBALL_URL /tmp/install-runner.sh"
    ]
  }

  provisioner "file" {
    content = templatefile("../start-runner.sh", {
      start_runner = templatefile("../../modules/runners/templates/start-runner.sh", {})
    })
    destination = "/tmp/start-runner.sh"
  }

  provisioner "shell" {
    inline = [
      "sudo mv /tmp/start-runner.sh /var/lib/cloud/scripts/per-boot/start-runner.sh",
      "sudo chmod +x /var/lib/cloud/scripts/per-boot/start-runner.sh",
    ]
  }

}