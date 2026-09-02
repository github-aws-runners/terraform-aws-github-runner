environment = "ministack-ephemeral"
aws_region  = "eu-west-1"

# These are MiniStack-only test identifiers, not AWS credentials.
aws_access_key = "000000000000"
aws_secret_key = "ministack-test-only"

skip_credentials_validation = true
skip_metadata_api_check     = true
skip_region_validation      = true
skip_requesting_account_id  = true
s3_use_path_style           = true

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
