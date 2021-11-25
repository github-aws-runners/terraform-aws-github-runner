packer {
  required_plugins {
    amazon = {
      version = ">= 0.0.2"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

source "amazon-ebs" "githubrunner" {
  ami_name      = "github-runner-amzn2-${formatdate("YYYYMMDDhhmm", timestamp())}"
  instance_type = "m3.medium"
  region        = "eu-west-1"
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
  tags = {
    OS_Version    = "amzn2"
    Release       = "Latest"
    Base_AMI_Name = "{{ .SourceAMIName }}"
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
      "sudo service docker start",
      "sudo usermod -a -G docker ec2-user",
    ]
  }

  provisioner "shell" {
    environment_vars = []
    script           = "./install-runner.sh"
  }

  provisioner "file" {
    source      = "startup.sh"
    destination = "/tmp/startup.sh"
  }

  provisioner "shell" {
    inline = [
      "sudo mv /tmp/startup.sh /var/lib/cloud/scripts/per-boot/startup.sh",
      "sudo chmod +x /var/lib/cloud/scripts/per-boot/startup.sh",
    ]
  }

}