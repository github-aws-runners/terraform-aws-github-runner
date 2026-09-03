resource "aws_ssm_parameter" "reconciler_config" {
  for_each = local.reconciler_configs

  name        = "${local.config_store_path_prefix}/${each.value.group_name}/${each.value.runner_name}"
  description = "Non-secret scale-set reconciler configuration for ${each.value.runner_name}"
  type        = "String"
  tier        = var.config_store.tier
  value       = local.reconciler_config_json[each.key]

  tags = merge(
    local.group_tags[each.value.group_name],
    var.config_store.tags,
  )

  lifecycle {
    precondition {
      condition     = local.reconciler_config_bytes[each.key] <= local.config_store_max_bytes
      error_message = "The encoded reconciler configuration exceeds the selected Parameter Store tier limit."
    }
  }

  depends_on = [
    terraform_data.validate_contract,
    terraform_data.validate_grouping,
    terraform_data.validate_config_store,
  ]
}
