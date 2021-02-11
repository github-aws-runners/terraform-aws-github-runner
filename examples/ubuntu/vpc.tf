module "vpc" {
  source = "git::https://github.com/philips-software/terraform-aws-vpc.git?ref=2.2.0"

  environment                = local.environment
  aws_region                 = local.aws_region
  create_private_hosted_zone = false
}
