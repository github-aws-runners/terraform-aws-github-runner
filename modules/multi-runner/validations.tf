resource "terraform_data" "validate_v1" {
  count = local.use_v2_config ? 0 : 1

  lifecycle {
    precondition {
      condition = (
        (var.github_app.key_base64 != null || var.github_app.key_base64_ssm != null) &&
        (var.github_app.id != null || var.github_app.id_ssm != null) &&
        (var.github_app.webhook_secret != null || var.github_app.webhook_secret_ssm != null) &&
        var.vpc_id != null &&
        var.subnet_ids != null &&
        length(var.multi_runner_config) > 0
      )
      error_message = "Stable v1 configuration requires github_app, vpc_id, subnet_ids, and multi_runner_config."
    }
  }
}

resource "terraform_data" "validate_v2" {
  count = local.use_v2_config ? 1 : 0

  lifecycle {
    precondition {
      condition = (
        (
          try(var.experimental_global_config_github.app.key_base64, null) != null ||
          try(var.experimental_global_config_github.app.key_base64_ssm, null) != null
          ) && (
          try(var.experimental_global_config_github.app.id, null) != null ||
          try(var.experimental_global_config_github.app.id_ssm, null) != null
          ) && (
          try(var.experimental_global_config_github.app.webhook_secret, null) != null ||
          try(var.experimental_global_config_github.app.webhook_secret_ssm, null) != null
        )
      )
      error_message = "Experimental v2 configuration requires a complete GitHub App under experimental_global_config_github.app."
    }

    precondition {
      condition = alltrue([
        for config in local.resolved_config.multi_runner_config : (
          try(config.orchestration_provider.webhook != null, false) &&
          try(length(config.orchestration_provider.webhook.matcherConfig.labelMatchers) > 0, false) &&
          try(config.compute_provider.aws.ec2 != null, false) &&
          try(length(config.compute_provider.aws.ec2.instance_types) > 0, false) &&
          try(config.compute_provider.aws.ec2.vpc_id != null, false) &&
          try(length(config.compute_provider.aws.ec2.subnet_ids) > 0, false)
        )
      ])
      error_message = "Each experimental v2 runner lane requires a webhook matcher, EC2 instance_types, vpc_id, and at least one subnet."
    }
  }
}
