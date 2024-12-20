locals {
  environment = "default"
  aws_region  = "eu-west-1"
}

resource "random_id" "random" {
  byte_length = 20
}


################################################################################
### Hybrid account
################################################################################

module "base" {
  source = "../base"

  prefix     = local.environment
  aws_region = local.aws_region
}


module "runners" {
  source                          = "../../"
  create_service_linked_role_spot = true
  aws_region                      = local.aws_region
  vpc_id                          = module.base.vpc.vpc_id
  subnet_ids                      = module.base.vpc.private_subnets

  prefix = local.environment
  tags = {
    Project = "ProjectX"
  }

  github_app = {
    key_base64     = var.github_app.key_base64
    id             = var.github_app.id
    webhook_secret = random_id.random.hex
  }

  # Grab zip files via lambda_download, will automatically get the ARM64 build
  webhook_lambda_zip                = "../lambdas-download/webhook.zip"
  runner_binaries_syncer_lambda_zip = "../lambdas-download/runner-binaries-syncer.zip"
  runners_lambda_zip                = "../lambdas-download/runners.zip"

  enable_organization_runners = false
  # Runners will automatically get the "arm64" label
  runner_extra_labels = ["default", "example"]

  # enable access to the runners via SSM
  enable_ssm_on_runners = true

  # use S3 or KMS SSE to runners S3 bucket
  # runner_binaries_s3_sse_configuration = {
  #   rule = {
  #     apply_server_side_encryption_by_default = {
  #       sse_algorithm = "AES256"
  #     }
  #   }
  # }

  # enable S3 versioning for runners S3 bucket
  # runner_binaries_s3_versioning = "Enabled"

  # Uncommet idle config to have idle runners from 9 to 5 in time zone Amsterdam
  # idle_config = [{
  #   cron      = "* * 9-17 * * *"
  #   timeZone  = "Europe/Amsterdam"
  #   idleCount = 1
  # }]

  # Let the module manage the service linked role
  # create_service_linked_role_spot = true

  runner_architecture = "arm64"
  # Ensure all instance types have ARM64 architecture (ie. AWS Graviton processors)
  instance_types = ["t4g.large", "c6g.large"]

  # override delay of events in seconds
  delay_webhook_event   = 5
  runners_maximum_count = 1

  # override scaling down
  scale_down_schedule_expression = "cron(* * * * ? *)"
}

module "webhook_github_app" {
  source = "../../modules/webhook-github-app"

  github_app = {
    key_base64     = var.github_app.key_base64
    id             = var.github_app.id
    webhook_secret = random_id.random.hex
  }
  webhook_endpoint = module.runners.webhook.endpoint
}
