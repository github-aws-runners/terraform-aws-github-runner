locals {
  environment = "boundaries"
  aws_region  = "eu-west-1"
}

resource "random_password" "random" {
  length = 32
}

data "terraform_remote_state" "iam" {
  backend = "local"

  config = {
    path = "${path.module}/setup/terraform.tfstate"
  }
}

resource "aws_kms_key" "github" {
  is_enabled = true
}

resource "aws_kms_alias" "github" {
  name          = "alias/github/action-runners"
  target_key_id = aws_kms_key.github.key_id
}

module "runners" {
  source = "../../"
  providers = {
    aws = aws.terraform_role
  }

  aws_region     = local.aws_region
  vpc_id         = module.vpc.vpc_id
  subnet_ids     = module.vpc.private_subnets
  manage_kms_key = false
  kms_key_id     = aws_kms_key.github.key_id

  environment = local.environment
  tags = {
    Project = "ProjectX"
  }

  github_app = {
    key_base64     = var.github_app_key_base64
    id             = var.github_app_id
    client_id      = var.github_app_client_id
    client_secret  = var.github_app_client_secret
    webhook_secret = random_password.random.result
  }

  webhook_lambda_zip                = "lambdas-download/webhook.zip"
  runner_binaries_syncer_lambda_zip = "lambdas-download/runner-binaries-syncer.zip"
  runners_lambda_zip                = "lambdas-download/runners.zip"
  enable_organization_runners       = false
  runner_extra_labels               = "default,example"

  instance_profile_path     = "/runners/"
  role_path                 = "/runners/"
  role_permissions_boundary = data.terraform_remote_state.iam.outputs.boundary
}
