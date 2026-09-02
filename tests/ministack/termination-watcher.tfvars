aws_region = "eu-west-1"

# These are MiniStack-only test identifiers, not AWS credentials.
aws_access_key = "000000000000"
aws_secret_key = "ministack-test-only"

skip_credentials_validation = true
skip_metadata_api_check     = true
skip_region_validation      = true
skip_requesting_account_id  = true
s3_use_path_style           = true

config = {
  metrics = {
    enable = true
    metric = {
      enable_spot_termination_warning = true
    }
  }
  prefix = "ministack-termination-watcher"
  tag_filters = {
    "ghr:Application" = "github-action-runner"
  }
  zip = "../../tests/ministack/ministack-lambda.zip"
}
