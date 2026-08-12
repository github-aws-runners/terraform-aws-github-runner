locals {
  parameter_store_tags = jsonencode([
    for key, value in merge(var.tags, var.parameter_store_tags) : {
      Key   = key
      Value = value
    }
  ])

  runner_config_storage_backend = lower(var.runner_config_storage.backend)
  runner_config_storage_ssm     = local.runner_config_storage_backend == "ssm"
  runner_config_storage_dynamodb = (
    local.runner_config_storage_backend == "dynamodb"
  )
  runner_config_dynamodb_table_name = (
    local.runner_config_storage_dynamodb
    ? aws_dynamodb_table.runner_config[0].name
    : ""
  )
  runner_config_dynamodb_partition_key_name                 = var.runner_config_storage.dynamodb.partition_key_name
  runner_config_dynamodb_value_attribute_name               = var.runner_config_storage.dynamodb.value_attribute_name
  runner_config_dynamodb_config_key_prefix                  = var.runner_config_storage.dynamodb.config_key_prefix
  runner_config_dynamodb_consistent_read                    = var.runner_config_storage.dynamodb.consistent_read
  runner_config_dynamodb_token_overwrite_protection_enabled = var.runner_config_storage.dynamodb.token_overwrite_protection_enabled
  runner_config_dynamodb_token_key_prefix = coalesce(
    var.runner_config_storage.dynamodb.token_key_prefix,
    "arn:${var.aws_partition}:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/",
  )
  runner_config_dynamodb_token_leading_keys = (
    var.runner_config_storage.dynamodb.token_key_prefix == null
    ? ["$${ec2:SourceInstanceARN}"]
    : ["${var.runner_config_storage.dynamodb.token_key_prefix}*"]
  )
  runner_config_dynamodb_ttl_seconds = coalesce(
    var.runner_config_storage.dynamodb.token_ttl_seconds,
    local.ssm_housekeeper.config.minimumDaysOld * 86400,
  )
}
