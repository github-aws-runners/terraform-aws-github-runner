provider "aws" {
  region            = local.aws_region
  s3_use_path_style = var.aws_s3_use_path_style

  default_tags {
    tags = {
      Example = local.environment
    }
  }
}
