packer {
  required_plugins {
    amazon = {
      version = ">= 0.0.2"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

variable "action_runner_url" {
  description = "The URL to the tarball of the action runner"
  type        = string
  default     = "https://github.com/actions/runner/releases/download/v2.285.1/actions-runner-win-x64-2.285.1.zip"
}

variable "region" {
  description = "The region to build the image in"
  type        = string
  default     = "eu-west-1"
}

variable "ebs_delete_on_termination" {
  description = "Indicates whether the EBS volume is deleted on instance termination."
  type        = bool
  default     = true
}

source "amazon-ebs" "githubrunner" {
  ami_name      = "github-runner-windows-core-2019-${formatdate("YYYYMMDDhhmm", timestamp())}"
  communicator  = "winrm"
  instance_type = "t3a.medium"
  region        = var.region
  source_ami_filter {
    filters = {
      name                = "Windows_Server-2019-English-Core-ContainersLatest-*"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    most_recent = true
    owners      = ["amazon"]
  }
  tags = {
    OS_Version    = "windows-core-2019"
    Release       = "Latest"
    Base_AMI_Name = "{{ .SourceAMIName }}"
  }
  user_data_file = "./bootstrap_win.ps1"
  winrm_insecure = true
  winrm_port     = 5986
  winrm_use_ssl  = true
  winrm_username = "Administrator"

  launch_block_device_mappings {
    device_name           = "/dev/sda1"
    delete_on_termination = "${var.ebs_delete_on_termination}"
  }
}

build {
  name = "githubactions-runner"
  sources = [
    "source.amazon-ebs.githubrunner"
  ]

  provisioner "file" {
    content = templatefile("../start-runner.ps1", {
      start_runner = templatefile("../../modules/runners/templates/start-runner.ps1", {})
    })
    destination = "C:\\start-runner.ps1"
  }

  provisioner "powershell" {
    inline = [templatefile("./windows-provisioner.ps1", {
      action_runner_url = var.action_runner_url
    })]
  }
}
