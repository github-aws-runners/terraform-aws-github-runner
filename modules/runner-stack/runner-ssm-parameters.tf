# Shared runner configuration stored in SSM Parameter Store.
resource "aws_ssm_parameter" "runner_agent_mode" {
  name  = "${var.ssm.paths.root}/${var.ssm.paths.config}/agent_mode"
  type  = "String"
  value = var.runner.ephemeral ? "ephemeral" : "persistent"
  tags  = local.ssm_parameter_tags

  lifecycle {
    precondition {
      condition = local.scale_set == null ? true : (
        var.runner.ephemeral &&
        coalesce(var.runner.jit_config_enabled, var.runner.ephemeral) &&
        local.scale_set.min_runners <= var.runner.maximum_count &&
        var.runner.maximum_count <= 2147483647 &&
        try(var.compute_provider.ec2.user_data.enabled, false) &&
        try(var.compute_provider.ec2.user_data.template, null) == null &&
        try(var.compute_provider.ec2.user_data.content, null) == null &&
        try(var.compute_provider.ec2.metadata_options.instance_metadata_tags, "") == "enabled" &&
        try(var.compute_provider.ec2.metadata_options.http_endpoint, "") == "enabled"
      )
      error_message = "Scale-set mode requires ephemeral JIT runners, min_runners <= maximum_count, the default EC2 bootstrap, and an enabled instance metadata endpoint with instance metadata tags."
    }
  }
}

resource "aws_ssm_parameter" "disable_default_labels" {
  name  = "${var.ssm.paths.root}/${var.ssm.paths.config}/disable_default_labels"
  type  = "String"
  value = var.runner.disable_default_labels
  tags  = local.ssm_parameter_tags
}

resource "aws_ssm_parameter" "jit_config_enabled" {
  name  = "${var.ssm.paths.root}/${var.ssm.paths.config}/enable_jit_config"
  type  = "String"
  value = var.runner.jit_config_enabled == null ? var.runner.ephemeral : var.runner.jit_config_enabled
  tags  = local.ssm_parameter_tags
}

resource "aws_ssm_parameter" "token_path" {
  name  = "${var.ssm.paths.root}/${var.ssm.paths.config}/token_path"
  type  = "String"
  value = "${var.ssm.paths.root}/${var.ssm.paths.tokens}"
  tags  = local.ssm_parameter_tags
}
