resource "aws_cloudwatch_log_group" "controller" {
  for_each = local.controller_groups

  name              = "/aws/ecs/${local.group_resource_names[each.key]}"
  retention_in_days = var.logging.retention_in_days
  kms_key_id        = var.logging.kms_key_arn
  log_group_class   = var.logging.log_group_class

  tags = merge(
    local.group_tags[each.key],
    var.logging.tags,
  )

  depends_on = [
    terraform_data.validate_contract,
    terraform_data.validate_grouping,
    terraform_data.validate_runtime,
  ]
}
