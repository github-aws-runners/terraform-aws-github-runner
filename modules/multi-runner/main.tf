locals {
  tags = merge(var.tags, {
    "ghr:environment" = var.prefix
  })

  github_app_parameters = {
    id         = module.ssm.parameters.github_app_id
    key_base64 = module.ssm.parameters.github_app_key_base64
  }

  runner_extra_labels = { for k, v in var.multi_runner_config : k => sort(setsubtract(setunion(flatten(v.matcherConfig.labelMatchers), compact(v.runner_config.runner_extra_labels)), ["self-hosted", v.runner_config.runner_os, v.runner_config.runner_architecture])) }

  runner_config = { for k, v in var.multi_runner_config : k => merge({ id = aws_sqs_queue.queued_builds[k].id, arn = aws_sqs_queue.queued_builds[k].arn }, merge(v, { runner_config = merge(v.runner_config, { runner_extra_labels = local.runner_extra_labels[k] }) })) }

  tmp_distinct_list_unique_os_and_arch = distinct([for i, config in local.runner_config : { "os_type" : config.runner_config.runner_os, "architecture" : config.runner_config.runner_architecture } if config.runner_config.enable_runner_binaries_syncer])
  unique_os_and_arch                   = { for i, v in local.tmp_distinct_list_unique_os_and_arch : "${v.os_type}_${v.architecture}" => v }

  ssm_root_path = "/${var.ssm_paths.root}/${var.prefix}"
}

resource "random_string" "random" {
  length  = 24
  special = false
  upper   = false
}
