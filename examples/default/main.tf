locals {
  environment = "default"
  aws_region  = "eu-west-1"
}


resource "random_password" "random" {
  length = 32
}


module "runners" {
  source = "../../"

  aws_region = local.aws_region
  vpc_id     = module.vpc.vpc_id

  environment = local.environment
  tags = {
    Project = "ProjectX"
  }

  github_app_webhook_secret = random_password.random.result

}


