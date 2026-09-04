locals {
  tags = merge(local.effective_config.tags, {
    "ghr:environment" = var.prefix
  })

  primary_app_id         = coalesce(local.effective_config.github.app.id_ssm, module.ssm.parameters.github_app_id)
  primary_app_key_base64 = coalesce(local.effective_config.github.app.key_base64_ssm, module.ssm.parameters.github_app_key_base64)

  github_app_parameters = {
    id             = local.primary_app_id
    key_base64     = local.primary_app_key_base64
    webhook_secret = coalesce(local.effective_config.github.app.webhook_secret_ssm, module.ssm.parameters.github_app_webhook_secret)
    # Additional apps flow to the lambdas through the manifest parameter so
    # the lambda environment size stays constant regardless of app count.
    additional_apps_manifest = module.ssm.additional_apps_manifest
    additional_app_parameter_arns = flatten([
      for p in module.ssm.additional_app_parameters : concat(
        [p.id.arn, p.key_base64.arn],
        p.installation_id != null ? [p.installation_id.arn] : []
      )
    ])
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
