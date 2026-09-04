locals {
  tags = merge(local.effective_config.tags, {
    "ghr:environment" = var.prefix
  })

  primary_app_id         = coalesce(local.effective_config.github.app.id_ssm, module.ssm.parameters.github_app_id)
  primary_app_key_base64 = coalesce(local.effective_config.github.app.key_base64_ssm, module.ssm.parameters.github_app_key_base64)

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
    webhook_secret = coalesce(local.effective_config.github.app.webhook_secret_ssm, module.ssm.parameters.github_app_webhook_secret)
  }

  ssm_root_path = trimsuffix(coalesce(
    local.effective_config.ssm.paths.root,
    "/github-action-runners/${var.prefix}",
  ), "/")
}

resource "random_string" "random" {
  length  = 24
  special = false
  upper   = false

  lifecycle {
    precondition {
      condition = local.use_v2_config || (
        var.github_app.key_base64 != null || var.github_app.key_base64_ssm != null
        ) && (
        var.github_app.id != null || var.github_app.id_ssm != null
        ) && (
        var.github_app.webhook_secret != null || var.github_app.webhook_secret_ssm != null
      ) && var.vpc_id != null && var.subnet_ids != null && length(var.multi_runner_config) > 0
      error_message = "Stable v1 configuration requires github_app, vpc_id, subnet_ids, and multi_runner_config; v2 configuration supplies these through experimental inputs."
    }
  }
}
