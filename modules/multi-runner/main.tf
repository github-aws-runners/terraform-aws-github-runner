locals {
  primary_app_id         = coalesce(local.translated_experimental.github.app.id_ssm, module.ssm.parameters.github_app_id)
  primary_app_key_base64 = coalesce(local.translated_experimental.github.app.key_base64_ssm, module.ssm.parameters.github_app_key_base64)

  github_app_parameters = {
    id = concat(
      [local.primary_app_id],
      [for p in module.ssm.additional_app_parameters : p.id]
    )
    key_base64 = concat(
      [local.primary_app_key_base64],
      [for p in module.ssm.additional_app_parameters : p.key_base64]
    )
    installation_id = concat(
      [null],
      [for p in module.ssm.additional_app_parameters : p.installation_id]
    )
    webhook_secret = coalesce(local.translated_experimental.github.app.webhook_secret_ssm, module.ssm.parameters.github_app_webhook_secret)
  }

  # Keep a concrete map type when unrelated configuration values are unknown until apply.
  tmp_distinct_list_unique_os_and_arch = distinct([
    for _, config in lookup(local.runner_config_by_provider, "aws_ec2", {}) : {
      "os_type" : config.runner.os,
      "architecture" : config.runner.architecture
    }
    if try(config.compute_provider.aws.ec2.binaries_syncer.enabled, false)
  ])
  configured_runner_binary_targets = local.use_multi_runner_config_v2 ? var.experimental.compute_provider.aws.ec2.runner_binaries.targets : null
  unique_os_and_arch = local.configured_runner_binary_targets != null ? {
    for key, target in local.configured_runner_binary_targets : key => {
      os_type      = target.os
      architecture = target.architecture
    }
  } : { for _, v in local.tmp_distinct_list_unique_os_and_arch : "${v.os_type}_${v.architecture}" => v }
}

resource "random_string" "random" {
  length  = 24
  special = false
  upper   = false
}
