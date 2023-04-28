provider "aws" {
  region = local.aws_region
  default_tags {
    tags = {
      tf-aws-gh-runner-deploy = local.environment
    }
  }
}
