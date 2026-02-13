provider "aws" {
  region = local.aws_region

  default_tags {
    tags = {
      Example = local.environment
    }
  }
}
