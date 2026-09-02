environment = "ms-multi"
aws_region  = "eu-west-1"

github_app = {
  id         = "0"
  key_base64 = "ministack-invalid-key"
}

# The checkout contains Linux runner templates that MiniStack can exercise.
runner_config_names = ["linux-x64", "linux-arm64"]

ami = {
  filter = {
    name  = ["amzn2-ami-hvm-2.0.20231116.0-x86_64-gp2"]
    state = ["available"]
  }
  owners = ["self"]
}
