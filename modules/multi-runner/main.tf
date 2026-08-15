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
    webhook_secret = local.webhook_enabled ? coalesce(local.translated_experimental.github.app.webhook_secret_ssm, module.ssm.parameters.github_app_webhook_secret) : null
  }

  # Keep a concrete map type when unrelated configuration values are unknown until apply.
  tmp_distinct_list_unique_os_and_arch = distinct([
    for _, config in lookup(local.runner_config_by_provider, "ec2", {}) : {
      "os_type" : config.runner.os,
      "architecture" : config.runner.architecture
    }
    if config.compute_provider.ec2.binaries_syncer.enabled
  ])
  unique_os_and_arch = { for _, v in local.tmp_distinct_list_unique_os_and_arch : "${v.os_type}_${v.architecture}" => v }
}

resource "random_string" "random" {
  length  = 24
  special = false
  upper   = false
}
