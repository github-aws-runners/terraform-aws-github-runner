locals {
  tags = merge(var.tags, {
    "ghr:environment" = var.prefix
  })

  github_app_parameters = {
    id             = coalesce(var.github_app.id_ssm, module.ssm.parameters.github_app_id)
    key_base64     = coalesce(var.github_app.key_base64_ssm, module.ssm.parameters.github_app_key_base64)
    webhook_secret = coalesce(var.github_app.webhook_secret_ssm, module.ssm.parameters.github_app_webhook_secret)
  }

  runner_extra_labels = { for k, v in var.multi_runner_config : k => sort(setunion(flatten(v.matcherConfig.labelMatchers), compact(v.runner_config.runner_extra_labels))) }

  runner_config = { for k, v in var.multi_runner_config : k => merge({ id = aws_sqs_queue.queued_builds[k].id, arn = aws_sqs_queue.queued_builds[k].arn, url = aws_sqs_queue.queued_builds[k].url }, merge(v, { runner_config = merge(v.runner_config, { runner_extra_labels = local.runner_extra_labels[k] }) })) }

  tmp_distinct_list_unique_os_and_arch = distinct([for i, config in local.runner_config : { "os_type" : config.runner_config.runner_os, "architecture" : config.runner_config.runner_architecture } if config.runner_config.enable_runner_binaries_syncer])
  unique_os_and_arch                   = { for i, v in local.tmp_distinct_list_unique_os_and_arch : "${v.os_type}_${v.architecture}" => v }

  ssm_root_path = "/${var.ssm_paths.root}/${var.prefix}"

  scale_down_parameter_path_prefix = "${local.ssm_root_path}/scale-down"
}

resource "random_string" "random" {
  length  = 24
  special = false
  upper   = false
}

locals {
  scale_down_environment_configs = [
    for k, v in local.runner_config : {
      environment = "${var.prefix}-${k}"
      idle_config = v.runner_config.idle_config
      minimum_running_time_in_minutes = coalesce(
        v.runner_config.minimum_running_time_in_minutes,
        v.runner_config.runner_os == "windows" ? 15 : 5
      )
      runner_boot_time_in_minutes = v.runner_config.runner_boot_time_in_minutes
    }
  ]
}

module "scale_down" {
  source = "../runners/scale-down"

  environments        = local.scale_down_environment_configs
  prefix              = var.prefix
  schedule_expression = var.scale_down_schedule_expression
  ssm_parameter_path_prefix        = local.scale_down_parameter_path_prefix
  scale_down_parameter_store_tier  = var.scale_down_parameter_store_tier

  github_app_parameters            = local.github_app_parameters
  lambda_s3_bucket                 = var.lambda_s3_bucket
  runners_lambda_s3_key            = var.runners_lambda_s3_key
  runners_lambda_s3_object_version = var.runners_lambda_s3_object_version
  lambda_runtime                   = var.lambda_runtime
  lambda_timeout                   = var.runners_scale_down_lambda_timeout
  lambda_memory_size               = var.scale_down_lambda_memory_size
  lambda_architecture              = var.lambda_architecture
  lambda_zip                       = var.runners_lambda_zip
  lambda_subnet_ids                = var.lambda_subnet_ids
  lambda_security_group_ids        = var.lambda_security_group_ids
  lambda_tags                      = var.lambda_tags
  tracing_config                   = var.tracing_config
  logging_retention_in_days        = var.logging_retention_in_days
  logging_kms_key_id               = var.logging_kms_key_id
  kms_key_arn                      = coalesce(var.kms_key_arn, "")
  ghes_url                         = var.ghes_url
  ghes_ssl_verify                  = var.ghes_ssl_verify
  user_agent                       = var.user_agent
  log_level                        = var.log_level
  metrics                          = var.metrics
  role_path                        = var.role_path
  role_permissions_boundary        = var.role_permissions_boundary
  aws_partition                    = var.aws_partition
  tags                             = local.tags
}
