locals {
  tags = merge(var.tags, {
    "ghr:environment" = var.prefix
  })

  github_app_parameters = {
    id         = module.ssm.parameters.github_app_id
    key_base64 = module.ssm.parameters.github_app_key_base64
  }

  runner_config = { for k, v in var.multi_runner_config : k => merge({ id = aws_sqs_queue.queued_builds[k].id, arn = aws_sqs_queue.queued_builds[k].arn }, v) }

  tmp_distinct_list_unique_os_and_arch = distinct([for i, config in local.runner_config : { "os_type" : config.runner_config.runner_os, "architecture" : config.runner_config.runner_architecture } if config.runner_config.enable_runner_binaries_syncer])
  unique_os_and_arch                   = { for i, v in local.tmp_distinct_list_unique_os_and_arch : "${v.os_type}_${v.architecture}" => v }

  ssm_root_path = "/${var.ssm_paths.root}/${var.prefix}"
}

resource "random_string" "random" {
  length  = 24
  special = false
  upper   = false
}

module "docker_cache" {
  source = "./docker_cache"

  config = {
    prefix                    = var.prefix
    tags                      = local.tags
    vpc_id                    = var.vpc_id
    subnet_ids                = var.subnet_ids
    lambda_security_group_ids = var.lambda_security_group_ids
  }
}

module "s3_endpoint" {
  source = "./s3_endpoint"

  config = {
    aws_region = var.aws_region
    vpc_id     = var.vpc_id
  }
}
