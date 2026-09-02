environment = "ministack-ephemeral"
aws_region  = "eu-west-1"

github_app = {
  id         = "0"
  key_base64 = "ministack-invalid-key"
}

ami = {
  filter = {
    name  = ["amzn2-ami-hvm-2.0.20231116.0-x86_64-gp2"]
    state = ["available"]
  }
  owners = ["self"]
}

webhook_lambda_zip                = "../../tests/ministack/ministack-lambda.zip"
runner_binaries_syncer_lambda_zip = "../../tests/ministack/ministack-lambda.zip"
runners_lambda_zip                = "../../tests/ministack/ministack-lambda.zip"

# MiniStack cannot configure a real GitHub webhook.
enable_webhook_github_app = false
