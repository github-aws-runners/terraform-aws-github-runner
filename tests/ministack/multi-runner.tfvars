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

ami_ssm_parameters = {
  x64 = {
    arn   = "arn:aws:ssm:eu-west-1:000000000000:parameter/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64"
    name  = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64"
    value = "ami-0a1b2c3d4e5f67890"
  }
  arm64 = {
    arn   = "arn:aws:ssm:eu-west-1:000000000000:parameter/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-arm64"
    name  = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-arm64"
    value = "ami-0a1b2c3d4e5f67890"
  }
}

runner_binaries_syncer_lambda_zip = "../../tests/ministack/ministack-lambda.zip"
runners_lambda_zip                = "../../tests/ministack/ministack-lambda.zip"
webhook_lambda_zip                = "../../tests/ministack/ministack-lambda.zip"

# MiniStack cannot configure a real GitHub webhook.
enable_webhook_github_app = false
