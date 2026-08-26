# The permissions-boundary override merges an alias into this provider when
# TFLint evaluates this standalone fixture directory.
# tflint-ignore: terraform_unused_declarations
provider "aws" {
  region = "eu-west-1"

  # These values are MiniStack test identifiers and cannot authenticate to AWS.
  access_key = "000000000000"
  secret_key = "ministack-test-only"

  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_region_validation      = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true
}
