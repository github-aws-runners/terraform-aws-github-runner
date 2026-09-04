data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

data "aws_subnet" "selected" {
  for_each = local.network_connector_subnets
  id       = each.value.subnet_id
}

locals {
  artifact_prefix = "lambda-microvms"

  image_arn_pattern      = "arn:${data.aws_partition.current.partition}:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:microvm-image:${var.image_name_prefix}-*"
  log_group_arn_pattern  = "arn:${data.aws_partition.current.partition}:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/microvms/${var.image_name_prefix}-*"
  log_stream_arn_pattern = "${local.log_group_arn_pattern}:log-stream:*"

  network_connector_subnets = merge({}, [
    for connector_key, connector in var.network_connectors : {
      for subnet_id in connector.subnet_ids :
      "${connector_key}/${subnet_id}" => {
        connector_key = connector_key
        subnet_id     = subnet_id
      }
    }
  ]...)

  connector_arns = {
    for connector_key, connector in aws_lambdacore_network_connector.connector :
    connector_key => connector.arn
  }
}
