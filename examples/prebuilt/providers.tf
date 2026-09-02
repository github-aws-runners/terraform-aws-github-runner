provider "aws" {
  region                      = local.aws_region
  access_key                  = var.aws_access_key
  secret_key                  = var.aws_secret_key
  skip_credentials_validation = var.skip_credentials_validation
  skip_metadata_api_check     = var.skip_metadata_api_check
  skip_region_validation      = var.skip_region_validation
  skip_requesting_account_id  = var.skip_requesting_account_id
  s3_use_path_style           = var.s3_use_path_style

  default_tags {
    tags = {
      Example = local.environment
    }
  }
}
