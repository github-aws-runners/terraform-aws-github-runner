provider "aws" {
  region  = local.aws_region
  profile = "pesandbox-admin"

  default_tags {
    tags = {
      Example = local.environment
    }
  }
}
