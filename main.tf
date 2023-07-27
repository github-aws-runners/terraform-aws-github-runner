locals {
  tags = merge(var.tags, {
    "ghr:environment" = var.prefix
  })

  github_app_parameters = {
    id         = module.ssm.parameters.github_app_id
    key_base64 = module.ssm.parameters.github_app_key_base64
  }

  default_runner_labels = "self-hosted,${var.runner_os},${var.runner_architecture}"
  runner_labels         = var.runner_extra_labels != "" ? "${local.default_runner_labels},${var.runner_extra_labels}" : local.default_runner_labels

  ssm_root_path = var.ssm_paths.use_prefix ? "/${var.ssm_paths.root}/${var.prefix}" : "/${var.ssm_paths.root}"
}

resource "random_string" "random" {
  length  = 24
  special = false
  upper   = false
}

data "aws_iam_policy_document" "deny_unsecure_transport" {
  statement {
    sid = "DenyUnsecureTransport"

    effect = "Deny"

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    actions = [
      "sqs:*"
    ]

    resources = [
      "*"
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_sqs_queue_policy" "build_queue_policy" {
  queue_url = aws_sqs_queue.queued_builds.id
  policy    = data.aws_iam_policy_document.deny_unsecure_transport.json
}

resource "aws_sqs_queue_policy" "webhook_events_workflow_job_queue_policy" {
  count     = var.enable_workflow_job_events_queue ? 1 : 0
  queue_url = aws_sqs_queue.webhook_events_workflow_job_queue[0].id
  policy    = data.aws_iam_policy_document.deny_unsecure_transport.json
}

resource "aws_sqs_queue" "queued_builds" {
  name                        = "${var.prefix}-queued-builds${var.enable_fifo_build_queue ? ".fifo" : ""}"
  delay_seconds               = var.delay_webhook_event
  visibility_timeout_seconds  = var.runners_scale_up_lambda_timeout
  message_retention_seconds   = var.job_queue_retention_in_seconds
  fifo_queue                  = var.enable_fifo_build_queue
  receive_wait_time_seconds   = 0
  content_based_deduplication = var.enable_fifo_build_queue
  redrive_policy = var.redrive_build_queue.enabled ? jsonencode({
    deadLetterTargetArn = aws_sqs_queue.queued_builds_dlq[0].arn,
    maxReceiveCount     = var.redrive_build_queue.maxReceiveCount
  }) : null

  sqs_managed_sse_enabled           = var.queue_encryption.sqs_managed_sse_enabled
  kms_master_key_id                 = var.queue_encryption.kms_master_key_id
  kms_data_key_reuse_period_seconds = var.queue_encryption.kms_data_key_reuse_period_seconds

  tags = var.tags
}

resource "aws_sqs_queue" "webhook_events_workflow_job_queue" {
  count                       = var.enable_workflow_job_events_queue ? 1 : 0
  name                        = "${var.prefix}-webhook_events_workflow_job_queue"
  delay_seconds               = var.workflow_job_queue_configuration.delay_seconds
  visibility_timeout_seconds  = var.workflow_job_queue_configuration.visibility_timeout_seconds
  message_retention_seconds   = var.workflow_job_queue_configuration.message_retention_seconds
  fifo_queue                  = false
  receive_wait_time_seconds   = 0
  content_based_deduplication = false
  redrive_policy              = null

  sqs_managed_sse_enabled           = var.queue_encryption.sqs_managed_sse_enabled
  kms_master_key_id                 = var.queue_encryption.kms_master_key_id
  kms_data_key_reuse_period_seconds = var.queue_encryption.kms_data_key_reuse_period_seconds

  tags = var.tags
}

resource "aws_sqs_queue_policy" "build_queue_dlq_policy" {
  count     = var.redrive_build_queue.enabled ? 1 : 0
  queue_url = aws_sqs_queue.queued_builds.id
  policy    = data.aws_iam_policy_document.deny_unsecure_transport.json
}

resource "aws_sqs_queue" "queued_builds_dlq" {
  count = var.redrive_build_queue.enabled ? 1 : 0
  name  = "${var.prefix}-queued-builds_dead_letter${var.enable_fifo_build_queue ? ".fifo" : ""}"

  sqs_managed_sse_enabled           = var.queue_encryption.sqs_managed_sse_enabled
  kms_master_key_id                 = var.queue_encryption.kms_master_key_id
  kms_data_key_reuse_period_seconds = var.queue_encryption.kms_data_key_reuse_period_seconds
  fifo_queue                        = var.enable_fifo_build_queue
  tags                              = var.tags
}

module "ssm" {
  source = "./modules/ssm"

  kms_key_arn = var.kms_key_arn
  path_prefix = "${local.ssm_root_path}/${var.ssm_paths.app}"
  github_app  = var.github_app
  tags        = local.tags
}

module "webhook" {
  source = "./modules/webhook"

  prefix      = var.prefix
  tags        = local.tags
  kms_key_arn = var.kms_key_arn

  runner_config = {
    (aws_sqs_queue.queued_builds.id) = {
      id : aws_sqs_queue.queued_builds.id
      arn : aws_sqs_queue.queued_builds.arn
      fifo : var.enable_fifo_build_queue
      matcherConfig : {
        labelMatchers : [split(",", local.runner_labels)]
        exactMatch : var.enable_runner_workflow_job_labels_check_all
      }
    }
  }
  sqs_workflow_job_queue = length(aws_sqs_queue.webhook_events_workflow_job_queue) > 0 ? aws_sqs_queue.webhook_events_workflow_job_queue[0] : null

  github_app_parameters = {
    webhook_secret = module.ssm.parameters.github_app_webhook_secret
  }

  lambda_s3_bucket                              = var.lambda_s3_bucket
  webhook_lambda_s3_key                         = var.webhook_lambda_s3_key
  webhook_lambda_s3_object_version              = var.webhook_lambda_s3_object_version
  webhook_lambda_apigateway_access_log_settings = var.webhook_lambda_apigateway_access_log_settings
  lambda_runtime                                = var.lambda_runtime
  lambda_architecture                           = var.lambda_architecture
  lambda_zip                                    = var.webhook_lambda_zip
  lambda_timeout                                = var.webhook_lambda_timeout
  lambda_tracing_mode                           = var.lambda_tracing_mode
  logging_retention_in_days                     = var.logging_retention_in_days
  logging_kms_key_id                            = var.logging_kms_key_id

  role_path                 = var.role_path
  role_permissions_boundary = var.role_permissions_boundary
  repository_white_list     = var.repository_white_list

  lambda_subnet_ids         = var.lambda_subnet_ids
  lambda_security_group_ids = var.lambda_security_group_ids
  aws_partition             = var.aws_partition

  log_level = var.log_level
}

module "runners" {
  source = "./modules/runners"

  aws_region    = var.aws_region
  aws_partition = var.aws_partition
  vpc_id        = var.vpc_id
  subnet_ids    = var.subnet_ids
  prefix        = var.prefix
  tags          = local.tags

  ssm_paths = {
    root   = local.ssm_root_path
    tokens = "${var.ssm_paths.runners}/tokens"
    config = "${var.ssm_paths.runners}/config"
  }

  s3_runner_binaries = var.enable_runner_binaries_syncer ? {
    arn = module.runner_binaries[0].bucket.arn
    id  = module.runner_binaries[0].bucket.id
    key = module.runner_binaries[0].runner_distribution_object_key
  } : null

  runner_os                     = var.runner_os
  instance_types                = var.instance_types
  instance_target_capacity_type = var.instance_target_capacity_type
  instance_allocation_strategy  = var.instance_allocation_strategy
  instance_max_spot_price       = var.instance_max_spot_price
  block_device_mappings         = var.block_device_mappings

  runner_architecture       = var.runner_architecture
  ami_filter                = var.ami_filter
  ami_owners                = var.ami_owners
  ami_id_ssm_parameter_name = var.ami_id_ssm_parameter_name
  ami_kms_key_arn           = var.ami_kms_key_arn

  sqs_build_queue                      = aws_sqs_queue.queued_builds
  github_app_parameters                = local.github_app_parameters
  enable_organization_runners          = var.enable_organization_runners
  enable_ephemeral_runners             = var.enable_ephemeral_runners
  enable_jit_config                    = var.enable_jit_config
  enable_job_queued_check              = var.enable_job_queued_check
  disable_runner_autoupdate            = var.disable_runner_autoupdate
  enable_managed_runner_security_group = var.enable_managed_runner_security_group
  enable_runner_detailed_monitoring    = var.enable_runner_detailed_monitoring
  scale_down_schedule_expression       = var.scale_down_schedule_expression
  minimum_running_time_in_minutes      = var.minimum_running_time_in_minutes
  runner_boot_time_in_minutes          = var.runner_boot_time_in_minutes
  runner_labels                        = local.runner_labels
  runner_as_root                       = var.runner_as_root
  runner_run_as                        = var.runner_run_as
  runners_maximum_count                = var.runners_maximum_count
  idle_config                          = var.idle_config
  enable_ssm_on_runners                = var.enable_ssm_on_runners
  egress_rules                         = var.runner_egress_rules
  runner_additional_security_group_ids = var.runner_additional_security_group_ids
  metadata_options                     = var.runner_metadata_options
  credit_specification                 = var.runner_credit_specification

  enable_runner_binaries_syncer    = var.enable_runner_binaries_syncer
  lambda_s3_bucket                 = var.lambda_s3_bucket
  runners_lambda_s3_key            = var.runners_lambda_s3_key
  runners_lambda_s3_object_version = var.runners_lambda_s3_object_version
  lambda_runtime                   = var.lambda_runtime
  lambda_architecture              = var.lambda_architecture
  lambda_zip                       = var.runners_lambda_zip
  lambda_timeout_scale_up          = var.runners_scale_up_lambda_timeout
  lambda_timeout_scale_down        = var.runners_scale_down_lambda_timeout
  lambda_subnet_ids                = var.lambda_subnet_ids
  lambda_security_group_ids        = var.lambda_security_group_ids
  lambda_tracing_mode              = var.lambda_tracing_mode
  logging_retention_in_days        = var.logging_retention_in_days
  logging_kms_key_id               = var.logging_kms_key_id
  enable_cloudwatch_agent          = var.enable_cloudwatch_agent
  cloudwatch_config                = var.cloudwatch_config
  runner_log_files                 = var.runner_log_files
  runner_group_name                = var.runner_group_name
  runner_name_prefix               = var.runner_name_prefix

  scale_up_reserved_concurrent_executions = var.scale_up_reserved_concurrent_executions

  instance_profile_path     = var.instance_profile_path
  role_path                 = var.role_path
  role_permissions_boundary = var.role_permissions_boundary

  enable_userdata                = var.enable_userdata
  enable_user_data_debug_logging = var.enable_user_data_debug_logging_runner
  userdata_template              = var.userdata_template
  userdata_pre_install           = var.userdata_pre_install
  userdata_post_install          = var.userdata_post_install
  key_name                       = var.key_name
  runner_ec2_tags                = var.runner_ec2_tags

  create_service_linked_role_spot = var.create_service_linked_role_spot

  runner_iam_role_managed_policy_arns = var.runner_iam_role_managed_policy_arns

  ghes_url        = var.ghes_url
  ghes_ssl_verify = var.ghes_ssl_verify

  kms_key_arn = var.kms_key_arn

  log_level = var.log_level

  pool_config                                = var.pool_config
  pool_lambda_timeout                        = var.pool_lambda_timeout
  pool_runner_owner                          = var.pool_runner_owner
  pool_lambda_reserved_concurrent_executions = var.pool_lambda_reserved_concurrent_executions
}

module "runner_binaries" {
  count = var.enable_runner_binaries_syncer ? 1 : 0

  source = "./modules/runner-binaries-syncer"

  prefix = var.prefix
  tags   = local.tags

  distribution_bucket_name = lower("${var.prefix}-dist-${random_string.random.result}")
  s3_logging_bucket        = var.runner_binaries_s3_logging_bucket
  s3_logging_bucket_prefix = var.runner_binaries_s3_logging_bucket_prefix

  runner_os                        = var.runner_os
  runner_architecture              = var.runner_architecture
  runner_allow_prerelease_binaries = var.runner_allow_prerelease_binaries

  lambda_s3_bucket                = var.lambda_s3_bucket
  syncer_lambda_s3_key            = var.syncer_lambda_s3_key
  syncer_lambda_s3_object_version = var.syncer_lambda_s3_object_version
  lambda_runtime                  = var.lambda_runtime
  lambda_architecture             = var.lambda_architecture
  lambda_zip                      = var.runner_binaries_syncer_lambda_zip
  lambda_timeout                  = var.runner_binaries_syncer_lambda_timeout
  lambda_tracing_mode             = var.lambda_tracing_mode
  logging_retention_in_days       = var.logging_retention_in_days
  logging_kms_key_id              = var.logging_kms_key_id

  enable_event_rule_binaries_syncer    = var.enable_event_rule_binaries_syncer
  server_side_encryption_configuration = var.runner_binaries_s3_sse_configuration
  s3_versioning                        = var.runner_binaries_s3_versioning

  role_path                 = var.role_path
  role_permissions_boundary = var.role_permissions_boundary

  log_level = var.log_level

  lambda_subnet_ids         = var.lambda_subnet_ids
  lambda_security_group_ids = var.lambda_security_group_ids
  aws_partition             = var.aws_partition


  lambda_principals = var.lambda_principals
}
