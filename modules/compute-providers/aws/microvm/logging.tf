locals {
  provider_tags = merge(
    {
      "Name" = format("%s-action-runner", var.prefix)
    },
    var.tags,
  )

  log_group_tags = merge(
    local.provider_tags,
    var.observability.logs.tags,
  )
}

resource "aws_cloudwatch_log_group" "runtime" {
  name              = "/github-self-hosted-runners/${var.prefix}/microvm"
  retention_in_days = var.observability.logs.retention_in_days
  kms_key_id        = var.observability.logs.kms_key_id
  log_group_class   = var.observability.logs.class
  tags              = local.log_group_tags
}
