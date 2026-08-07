locals {
  tags = merge(var.tags, {
    "ghr:environment" = var.prefix
  })

  github_app_parameters = {
    id             = coalesce(var.github_app.id_ssm, module.ssm.parameters.github_app_id)
    key_base64     = coalesce(var.github_app.key_base64_ssm, module.ssm.parameters.github_app_key_base64)
    webhook_secret = coalesce(var.github_app.webhook_secret_ssm, module.ssm.parameters.github_app_webhook_secret)
  }

  ssm_root_path = "/${var.ssm_paths.root}/${var.prefix}"
}

resource "random_string" "random" {
  length  = 24
  special = false
  upper   = false

  lifecycle {
    precondition {
      condition     = length(local.duplicate_runner_config_keys) == 0
      error_message = "Lane keys must be unique across multi_runner_config and multi_runner_config_v2. Duplicate keys: ${join(", ", sort(tolist(local.duplicate_runner_config_keys)))}."
    }
  }
}
