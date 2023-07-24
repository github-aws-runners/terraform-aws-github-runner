data "aws_caller_identity" "current" {}

locals {
  environment = var.environment != null ? var.environment : "multi-runner"
  aws_region  = "eu-west-1"
  tags        = { Project = "multi-runner" }

  # Load runner configurations from Yaml files
  multi_runner_config = {
    for c in fileset("${path.module}/templates/runner-configs", "*.yaml") : trimsuffix(c, ".yaml") =>
    yamldecode(
      templatefile(
        "${path.module}/templates/runner-configs/${c}",
        {
          account_id = data.aws_caller_identity.current.account_id
        }
      )
    )
  }
}

resource "random_id" "random" {
  byte_length = 20
}

module "base" {
  source = "../base"

  prefix     = local.environment
  aws_region = local.aws_region
}

# module "s3-cache-platform" {
#   source      = "../../modules/s3-cache"
#   bucket_name = "${local.environment}-platform-cache"
#   tags        = local.tags
#   runner_role = module.base.runners.aws_iam_role.runner
# }

# module "s3-cache-core" {
#   source      = "../../modules/s3-cache"
#   bucket_name = "${local.environment}-core-cache"
#   tags        = local.tags
#   runner_role = "multi-runner-linux-x64-core-runner-role"
# }

module "multi-runner" {
  source                            = "../../modules/multi-runner"
  multi_runner_config               = local.multi_runner_config
  aws_region                        = local.aws_region
  vpc_id                            = module.base.vpc.vpc_id
  subnet_ids                        = module.base.vpc.private_subnets
  runners_scale_up_lambda_timeout   = 60
  runners_scale_down_lambda_timeout = 30
  prefix                            = local.environment
  tags                              = local.tags
  github_app = {
    key_base64     = var.github_app.key_base64
    id             = var.github_app.id
    webhook_secret = random_id.random.hex
  }

  # Assuming local build lambda's to use pre build ones, uncomment the lines below and download the
  # lambda zip files lambda_download
  webhook_lambda_zip                = "../lambdas-download/webhook.zip"
  runner_binaries_syncer_lambda_zip = "../lambdas-download/runner-binaries-syncer.zip"
  runners_lambda_zip                = "../lambdas-download/runners.zip"

  # enable_workflow_job_events_queue = true
  # override delay of events in seconds

  # Enable debug logging for the lambda functions
  # log_level = "debug"
}
