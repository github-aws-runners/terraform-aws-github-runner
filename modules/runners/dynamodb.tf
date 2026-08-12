locals {
  runner_config_dynamodb_items_base = {
    run_as                 = var.runner_as_root ? "root" : var.runner_run_as
    agent_mode             = var.enable_ephemeral_runners ? "ephemeral" : "persistent"
    disable_default_labels = tostring(var.runner_disable_default_labels)
    enable_jit_config      = tostring(var.enable_jit_config == null ? var.enable_ephemeral_runners : var.enable_jit_config)
    enable_cloudwatch      = tostring(var.enable_cloudwatch_agent)
  }

  runner_config_dynamodb_items = merge(
    local.runner_config_dynamodb_items_base,
    var.enable_cloudwatch_agent ? {
      cloudwatch_agent_config_runner = local.cloudwatch_agent_config_runner
    } : {}
  )

  runner_config_dynamodb_alarm_dimensions = {
    TableName = local.runner_config_dynamodb_table_name
  }

  runner_config_dynamodb_base_alarms = {
    read_throttle_events = {
      alarm_name          = "${var.prefix}-runner-config-dynamodb-read-throttles"
      alarm_description   = "DynamoDB read throttles on the runner config table."
      metric_name         = "ReadThrottleEvents"
      statistic           = "Sum"
      comparison_operator = "GreaterThanThreshold"
      threshold           = var.runner_config_storage.dynamodb.read_throttle_alarm_threshold
    }
    write_throttle_events = {
      alarm_name          = "${var.prefix}-runner-config-dynamodb-write-throttles"
      alarm_description   = "DynamoDB write throttles on the runner config table."
      metric_name         = "WriteThrottleEvents"
      statistic           = "Sum"
      comparison_operator = "GreaterThanThreshold"
      threshold           = var.runner_config_storage.dynamodb.write_throttle_alarm_threshold
    }
    system_errors = {
      alarm_name          = "${var.prefix}-runner-config-dynamodb-system-errors"
      alarm_description   = "DynamoDB system errors on the runner config table."
      metric_name         = "SystemErrors"
      statistic           = "Sum"
      comparison_operator = "GreaterThanThreshold"
      threshold           = var.runner_config_storage.dynamodb.system_errors_alarm_threshold
    }
    user_errors = {
      alarm_name          = "${var.prefix}-runner-config-dynamodb-user-errors"
      alarm_description   = "DynamoDB user errors on the runner config table."
      metric_name         = "UserErrors"
      statistic           = "Sum"
      comparison_operator = "GreaterThanThreshold"
      threshold           = var.runner_config_storage.dynamodb.user_errors_alarm_threshold
    }
  }

  runner_config_dynamodb_capacity_alarms = merge(
    var.runner_config_storage.dynamodb.consumed_read_capacity_threshold == null ? {} : {
      consumed_read_capacity = {
        alarm_name          = "${var.prefix}-runner-config-dynamodb-consumed-read-capacity"
        alarm_description   = "DynamoDB consumed read capacity on the runner config table."
        metric_name         = "ConsumedReadCapacityUnits"
        statistic           = "Sum"
        comparison_operator = "GreaterThanThreshold"
        threshold           = var.runner_config_storage.dynamodb.consumed_read_capacity_threshold
      }
    },
    var.runner_config_storage.dynamodb.consumed_write_capacity_threshold == null ? {} : {
      consumed_write_capacity = {
        alarm_name          = "${var.prefix}-runner-config-dynamodb-consumed-write-capacity"
        alarm_description   = "DynamoDB consumed write capacity on the runner config table."
        metric_name         = "ConsumedWriteCapacityUnits"
        statistic           = "Sum"
        comparison_operator = "GreaterThanThreshold"
        threshold           = var.runner_config_storage.dynamodb.consumed_write_capacity_threshold
      }
    }
  )

  runner_config_dynamodb_alarms = local.runner_config_storage_dynamodb && var.runner_config_storage.dynamodb.alarms_enabled ? merge(
    local.runner_config_dynamodb_base_alarms,
    local.runner_config_dynamodb_capacity_alarms
  ) : {}
}

resource "aws_dynamodb_table" "runner_config" {
  count = local.runner_config_storage_dynamodb ? 1 : 0

  name                        = coalesce(var.runner_config_storage.dynamodb.table_name, "${var.prefix}-runner-config")
  billing_mode                = var.runner_config_storage.dynamodb.billing_mode
  hash_key                    = local.runner_config_dynamodb_partition_key_name
  read_capacity               = var.runner_config_storage.dynamodb.billing_mode == "PROVISIONED" ? var.runner_config_storage.dynamodb.read_capacity : null
  write_capacity              = var.runner_config_storage.dynamodb.billing_mode == "PROVISIONED" ? var.runner_config_storage.dynamodb.write_capacity : null
  deletion_protection_enabled = var.runner_config_storage.dynamodb.deletion_protection_enabled

  attribute {
    name = local.runner_config_dynamodb_partition_key_name
    type = "S"
  }

  ttl {
    enabled        = var.runner_config_storage.dynamodb.ttl_enabled
    attribute_name = var.runner_config_storage.dynamodb.ttl_attribute_name
  }

  point_in_time_recovery {
    enabled = var.runner_config_storage.dynamodb.point_in_time_recovery_enabled
  }

  server_side_encryption {
    enabled     = var.runner_config_storage.dynamodb.server_side_encryption_enabled
    kms_key_arn = var.runner_config_storage.dynamodb.server_side_encryption_enabled ? var.runner_config_storage.dynamodb.kms_key_arn : null
  }

  tags = local.tags
}

resource "aws_dynamodb_table_item" "runner_config" {
  for_each = local.runner_config_storage_dynamodb ? local.runner_config_dynamodb_items : {}

  table_name = aws_dynamodb_table.runner_config[0].name
  hash_key   = aws_dynamodb_table.runner_config[0].hash_key

  item = jsonencode({
    (local.runner_config_dynamodb_partition_key_name) = {
      S = "${local.runner_config_dynamodb_config_key_prefix}${each.key}"
    }
    (local.runner_config_dynamodb_value_attribute_name) = {
      S = each.value
    }
  })
}

resource "aws_appautoscaling_target" "runner_config_dynamodb_read" {
  count = local.runner_config_storage_dynamodb && var.runner_config_storage.dynamodb.billing_mode == "PROVISIONED" && var.runner_config_storage.dynamodb.autoscaling_enabled ? 1 : 0

  max_capacity       = var.runner_config_storage.dynamodb.autoscaling_read_max_capacity
  min_capacity       = var.runner_config_storage.dynamodb.autoscaling_read_min_capacity
  resource_id        = "table/${aws_dynamodb_table.runner_config[0].name}"
  scalable_dimension = "dynamodb:table:ReadCapacityUnits"
  service_namespace  = "dynamodb"
}

resource "aws_appautoscaling_policy" "runner_config_dynamodb_read" {
  count = local.runner_config_storage_dynamodb && var.runner_config_storage.dynamodb.billing_mode == "PROVISIONED" && var.runner_config_storage.dynamodb.autoscaling_enabled ? 1 : 0

  name               = "${var.prefix}-runner-config-dynamodb-read"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.runner_config_dynamodb_read[0].resource_id
  scalable_dimension = aws_appautoscaling_target.runner_config_dynamodb_read[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.runner_config_dynamodb_read[0].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "DynamoDBReadCapacityUtilization"
    }

    target_value = var.runner_config_storage.dynamodb.autoscaling_read_target_value
  }
}

resource "aws_appautoscaling_target" "runner_config_dynamodb_write" {
  count = local.runner_config_storage_dynamodb && var.runner_config_storage.dynamodb.billing_mode == "PROVISIONED" && var.runner_config_storage.dynamodb.autoscaling_enabled ? 1 : 0

  max_capacity       = var.runner_config_storage.dynamodb.autoscaling_write_max_capacity
  min_capacity       = var.runner_config_storage.dynamodb.autoscaling_write_min_capacity
  resource_id        = "table/${aws_dynamodb_table.runner_config[0].name}"
  scalable_dimension = "dynamodb:table:WriteCapacityUnits"
  service_namespace  = "dynamodb"
}

resource "aws_appautoscaling_policy" "runner_config_dynamodb_write" {
  count = local.runner_config_storage_dynamodb && var.runner_config_storage.dynamodb.billing_mode == "PROVISIONED" && var.runner_config_storage.dynamodb.autoscaling_enabled ? 1 : 0

  name               = "${var.prefix}-runner-config-dynamodb-write"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.runner_config_dynamodb_write[0].resource_id
  scalable_dimension = aws_appautoscaling_target.runner_config_dynamodb_write[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.runner_config_dynamodb_write[0].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "DynamoDBWriteCapacityUtilization"
    }

    target_value = var.runner_config_storage.dynamodb.autoscaling_write_target_value
  }
}

resource "aws_cloudwatch_metric_alarm" "runner_config_dynamodb" {
  for_each = local.runner_config_dynamodb_alarms

  alarm_name                = each.value.alarm_name
  alarm_description         = each.value.alarm_description
  namespace                 = "AWS/DynamoDB"
  metric_name               = each.value.metric_name
  dimensions                = local.runner_config_dynamodb_alarm_dimensions
  statistic                 = each.value.statistic
  comparison_operator       = each.value.comparison_operator
  threshold                 = each.value.threshold
  period                    = var.runner_config_storage.dynamodb.alarm_period
  evaluation_periods        = var.runner_config_storage.dynamodb.alarm_evaluation_periods
  datapoints_to_alarm       = var.runner_config_storage.dynamodb.alarm_datapoints_to_alarm
  treat_missing_data        = var.runner_config_storage.dynamodb.alarm_treat_missing_data
  alarm_actions             = var.runner_config_storage.dynamodb.alarm_actions
  ok_actions                = var.runner_config_storage.dynamodb.ok_actions
  insufficient_data_actions = var.runner_config_storage.dynamodb.insufficient_data_actions
  tags                      = local.tags
}
