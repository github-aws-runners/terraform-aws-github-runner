locals {
  tags = merge(var.tags, {
    "ghr:environment" = var.prefix
  })

  # For enterprise runners, app id and key_base64 are not required. When not
  # provided, fall back to empty placeholder values so downstream Lambda env
  # vars are set but unused.
  primary_app_id         = coalesce(var.github_app.id_ssm, module.ssm.parameters.github_app_id, { name = "", arn = "" })
  primary_app_key_base64 = coalesce(var.github_app.key_base64_ssm, module.ssm.parameters.github_app_key_base64, { name = "", arn = "" })

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
    webhook_secret = coalesce(var.github_app.webhook_secret_ssm, module.ssm.parameters.github_app_webhook_secret)
  }

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

  # True when any configured runner registers at the enterprise level. Used to
  # relax the shared SSM `github_app` validation, since enterprise runners
  # authenticate with a PAT and don't require a GitHub App id/key.
  any_enterprise_runners = anytrue([
    for k, v in var.multi_runner_config :
    (v.runner_config.enable_organization_runners ? false : coalesce(v.runner_config.runner_registration_level, "repo") == "enterprise")
  ])

  runner_extra_labels = { for k, v in var.multi_runner_config : k => sort(setunion(flatten(v.matcherConfig.labelMatchers), compact(v.runner_config.runner_extra_labels))) }

  runner_config = { for k, v in var.multi_runner_config : k => merge(
    {
      id  = aws_sqs_queue.queued_builds[k].id
      arn = aws_sqs_queue.queued_builds[k].arn
      url = aws_sqs_queue.queued_builds[k].url
    },
    merge(v, { runner_config = merge(v.runner_config, { runner_extra_labels = local.runner_extra_labels[k] }) }),
  ) }

  tmp_distinct_list_unique_os_and_arch = distinct([for i, config in local.runner_config : { "os_type" : config.runner_config.runner_os, "architecture" : config.runner_config.runner_architecture } if config.runner_config.enable_runner_binaries_syncer])
  unique_os_and_arch                   = { for i, v in local.tmp_distinct_list_unique_os_and_arch : "${v.os_type}_${v.architecture}" => v }

  ssm_root_path = "/${var.ssm_paths.root}/${var.prefix}"
}

resource "random_string" "random" {
  length  = 24
  special = false
  upper   = false
}
