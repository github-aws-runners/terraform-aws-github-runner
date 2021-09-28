locals {
  tags = merge(var.tags, {
    Environment = var.environment
  })

  s3_action_runner_url_linux   = "s3://${module.runner_binaries.bucket.id}/${module.runner_binaries.runner_distribution_object_key_linux}"
  s3_action_runner_url_windows = "s3://${module.runner_binaries.bucket.id}/${module.runner_binaries.runner_distribution_object_key_windows}"
  runner_architecture          = substr(var.instance_type, 0, 2) == "a1" || substr(var.instance_type, 1, 2) == "6g" ? "arm64" : "x64"
}

resource "random_string" "random" {
  length  = 24
  special = false
  upper   = false
}

resource "aws_sqs_queue" "queued_builds" {
  name                        = "${var.environment}-queued-builds.fifo"
  visibility_timeout_seconds  = var.runners_scale_up_lambda_timeout
  fifo_queue                  = true
  content_based_deduplication = true

  tags = var.tags
}

module "webhook" {
  source = "./modules/webhook"

  aws_region  = var.aws_region
  environment = var.environment
  tags        = local.tags
  encryption = {
    kms_key_id = local.kms_key_id
    encrypt    = var.encrypt_secrets
  }

  sqs_build_queue           = aws_sqs_queue.queued_builds
  github_app_webhook_secret = var.github_app.webhook_secret

  lambda_s3_bucket                 = var.lambda_s3_bucket
  webhook_lambda_s3_key            = var.webhook_lambda_s3_key
  webhook_lambda_s3_object_version = var.webhook_lambda_s3_object_version
  lambda_zip                       = var.webhook_lambda_zip
  lambda_timeout                   = var.webhook_lambda_timeout
  logging_retention_in_days        = var.logging_retention_in_days

  role_path                 = var.role_path
  role_permissions_boundary = var.role_permissions_boundary
}

module "runners" {
  source = "./modules/runners"

  aws_region  = var.aws_region
  vpc_id      = var.vpc_id
  subnet_ids  = var.subnet_ids
  environment = var.environment
  tags        = local.tags
  encryption = {
    kms_key_id = local.kms_key_id
    encrypt    = var.encrypt_secrets
  }

  s3_bucket_runner_binaries           = module.runner_binaries.bucket
  s3_location_runner_binaries_linux   = local.s3_action_runner_url_linux
  s3_location_runner_binaries_windows = local.s3_action_runner_url_windows

  instance_type         = var.instance_type
  market_options        = var.market_options
  block_device_mappings = var.block_device_mappings

  runner_architecture = local.runner_architecture
  ami_owners          = var.ami_owners
  ami_filter_linux    = var.ami_filter_linux
  ami_filter_windows  = var.ami_filter_windows

  sqs_build_queue                      = aws_sqs_queue.queued_builds
  github_app                           = var.github_app
  enable_organization_runners          = var.enable_organization_runners
  scale_down_schedule_expression       = var.scale_down_schedule_expression
  minimum_running_time_in_minutes      = var.minimum_running_time_in_minutes
  runner_extra_labels                  = var.runner_extra_labels
  runner_as_root                       = var.runner_as_root
  runners_maximum_count                = var.runners_maximum_count
  idle_config                          = var.idle_config
  enable_ssm_on_runners                = var.enable_ssm_on_runners
  runner_additional_security_group_ids = var.runner_additional_security_group_ids
  secretsmanager_secrets_id            = var.secretsmanager_secrets_id

  lambda_s3_bucket                 = var.lambda_s3_bucket
  runners_lambda_s3_key            = var.runners_lambda_s3_key
  runners_lambda_s3_object_version = var.runners_lambda_s3_object_version
  lambda_zip                       = var.runners_lambda_zip
  lambda_timeout_scale_up          = var.runners_scale_up_lambda_timeout
  lambda_timeout_scale_down        = var.runners_scale_down_lambda_timeout
  lambda_subnet_ids                = var.lambda_subnet_ids
  lambda_security_group_ids        = var.lambda_security_group_ids
  logging_retention_in_days        = var.logging_retention_in_days
  enable_cloudwatch_agent          = var.enable_cloudwatch_agent
  cloudwatch_config                = var.cloudwatch_config
  runner_log_files                 = var.runner_log_files
  runner_group_name                = var.runner_group_name

  instance_profile_path     = var.instance_profile_path
  role_path                 = var.role_path
  role_permissions_boundary = var.role_permissions_boundary

  userdata_template     = var.userdata_template
  userdata_pre_install  = var.userdata_pre_install
  userdata_post_install = var.userdata_post_install
  key_name              = var.key_name

  create_service_linked_role_spot = var.create_service_linked_role_spot

  runner_iam_role_managed_policy_arns = var.runner_iam_role_managed_policy_arns

  ghes_url = var.ghes_url
}

module "runner_binaries" {
  source = "./modules/runner-binaries-syncer"

  aws_region  = var.aws_region
  environment = var.environment
  tags        = local.tags

  distribution_bucket_name = "${var.environment}-dist-${random_string.random.result}"

  runner_architecture              = local.runner_architecture
  runner_allow_prerelease_binaries = var.runner_allow_prerelease_binaries

  lambda_s3_bucket                = var.lambda_s3_bucket
  syncer_lambda_s3_key            = var.syncer_lambda_s3_key
  syncer_lambda_s3_object_version = var.syncer_lambda_s3_object_version
  lambda_zip                      = var.runner_binaries_syncer_lambda_zip
  lambda_timeout                  = var.runner_binaries_syncer_lambda_timeout
  logging_retention_in_days       = var.logging_retention_in_days

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
