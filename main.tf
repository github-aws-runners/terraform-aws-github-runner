locals {
  tags = merge(var.tags, {
    Environment = var.environment
  })

  s3_action_runner_url = "s3://${module.runner_binaries.bucket.id}/${module.runner_binaries.runner_distribution_object_key}"
  runner_architecture  = substr(var.instance_type, 0, 2) == "a1" || substr(var.instance_type, 1, 2) == "6g" ? "arm64" : "x64"
}

resource "random_string" "random" {
  length  = 24
  special = false
  upper   = false
}

module "runners" {
  source = "./modules/runners"

  aws_region               = var.aws_region
  vpc_id                   = var.vpc_id
  subnet_ids               = var.subnet_ids
  runner_security_group_id = var.runner_security_group_id
  environment              = var.environment
  tags                     = local.tags
  encryption = {
    kms_key_id = local.kms_key_id
    encrypt    = var.encrypt_secrets
  }

  s3_bucket_runner_binaries   = module.runner_binaries.bucket
  s3_location_runner_binaries = local.s3_action_runner_url

  instance_type  = var.instance_type
  market_options = var.market_options

  runner_architecture = local.runner_architecture
  ami_filter          = local.runner_architecture == "arm64" ? { name = ["amzn2-ami-hvm-2*-arm64-gp2"] } : { name = ["amzn2-ami-hvm-2.*-x86_64-ebs"] }

  github_app                      = var.github_app
  enable_organization_runners     = var.enable_organization_runners
  scale_down_schedule_expression  = var.scale_down_schedule_expression
  scale_up_schedule_expression    = var.scale_up_schedule_expression
  minimum_running_time_in_minutes = var.minimum_running_time_in_minutes
  runner_extra_labels             = var.runner_extra_labels
  runner_as_root                  = var.runner_as_root
  runners_maximum_count           = var.runners_maximum_count
  idle_config                     = var.idle_config

  lambda_zip                = var.runners_lambda_zip
  lambda_timeout_scale_up   = var.runners_scale_up_lambda_timeout
  lambda_timeout_scale_down = var.runners_scale_down_lambda_timeout
  logging_retention_in_days = var.logging_retention_in_days

  instance_profile_path     = var.instance_profile_path
  role_path                 = var.role_path
  role_permissions_boundary = var.role_permissions_boundary

  userdata_pre_install  = var.userdata_pre_install
  userdata_post_install = var.userdata_post_install
}

module "runner_binaries" {
  source = "./modules/runner-binaries-syncer"

  aws_region  = var.aws_region
  environment = var.environment
  tags        = local.tags

  distribution_bucket_name = "${var.environment}-dist-${random_string.random.result}"

  runner_architecture = substr(var.instance_type, 0, 2) == "a1" || substr(var.instance_type, 1, 2) == "6g" ? "arm64" : "x64"

  lambda_zip                = var.runner_binaries_syncer_lambda_zip
  lambda_timeout            = var.runner_binaries_syncer_lambda_timeout
  logging_retention_in_days = var.logging_retention_in_days

  role_path                 = var.role_path
  role_permissions_boundary = var.role_permissions_boundary
}

resource "aws_resourcegroups_group" "resourcegroups_group" {
  name = "${var.environment}-group"
  resource_query {
    query = templatefile("${path.module}/templates/resource-group.json", {
      environment = var.environment
    })
  }
}
