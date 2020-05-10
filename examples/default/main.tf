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
  subnet_ids = module.vpc.private_subnets

  environment = local.environment
  tags = {
    Project = "ProjectX"
  }

  github_app_client_id      = var.github_app_client_id
  github_app_client_secret  = var.github_app_client_secret
  github_app_id             = var.github_app_id
  github_app_key_base64     = var.github_app_key_base64
  github_app_webhook_secret = random_password.random.result

  enable_organization_runners = false
}


