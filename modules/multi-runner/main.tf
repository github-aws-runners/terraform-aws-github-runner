locals {
  tags = merge(local.effective_config.tags, {
    "ghr:environment" = var.prefix
  })

  # For enterprise runners, app id and key_base64 are not required. When not
  # provided, the parameters resolve to null and are skipped by the lambdas.
  primary_app_id              = try(coalesce(local.effective_config.github.app.id_ssm, module.ssm.parameters.github_app_id), null)
  primary_app_key_base64      = try(coalesce(local.effective_config.github.app.key_base64_ssm, module.ssm.parameters.github_app_key_base64), null)
  primary_app_installation_id = try(coalesce(local.effective_config.github.app.installation_id_ssm, module.ssm.parameters.github_app_installation_id), null)

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
    local.effective_config.storage_provider.aws.ssm.paths.root,
    "/github-action-runners/${var.prefix}",
  ), "/")

  enterprise_pat_parameters = var.enterprise_pat != null ? {
    name = coalesce(
      try(var.enterprise_pat.pat_ssm.name, null),
      try(module.ssm.parameters.enterprise_pat.name, null)
    )
    arn = coalesce(
      try(var.enterprise_pat.pat_ssm.arn, null),
      try(module.ssm.parameters.enterprise_pat.arn, null)
    )
  } : null

  # `enable_organization_runners` is deprecated in favor of `runner_registration_level`, but is kept
  # working for backwards compatibility. When set to `true` it takes priority over
  # `runner_registration_level` so existing configurations continue to behave as before.
  runner_registration_level = {
    for k, v in var.multi_runner_config : k => (
      try(v.runner_config.enable_organization_runners, false) ? "org" : coalesce(try(v.runner_config.runner_registration_level, null), "repo")
    )
  }

  # True when any configured runner registers at the enterprise level. Used to
  # relax the shared SSM `github_app` validation, since enterprise runners
  # authenticate with a PAT and don't require a GitHub App id/key.
  any_enterprise_runners = anytrue([for k, level in local.runner_registration_level : level == "enterprise"])
}

resource "random_string" "random" {
  length  = 24
  special = false
  upper   = false
}
