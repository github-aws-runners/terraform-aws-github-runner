provider "aws" {
  alias  = "terraform_role"
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
