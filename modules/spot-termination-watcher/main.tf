locals {
  lambda_zip = var.lambda.zip == null ? "${path.module}/../../lambdas/functions/spot-termination-watcher/spot-termination-watcher.zip" : var.lambda.zip
  name       = "spot-termination-watcher"

  environment_variables = {
    CREATE_METRICS = "true"
  }
}

module "spot_termination_warning_watcher" {
  source = "../lambda"

  lambda = {
    name    = local.name
    handler = "index.interruptionWarning"
    zip     = local.lambda_zip

    # Pass variables from the module to the lambda module
    aws_partition             = var.lambda.aws_partition
    architecture              = var.lambda.architecture
    environment_variables     = local.environment_variables
    log_level                 = var.lambda.log_level
    logging_kms_key_id        = var.lambda.logging_kms_key_id
    logging_retention_in_days = var.lambda.logging_retention_in_days
    memory_size               = var.lambda.memory_size
    prefix                    = var.lambda.prefix
    principals                = var.lambda.principals
    role_path                 = var.lambda.role_path
    role_permissions_boundary = var.lambda.role_permissions_boundary
    runtime                   = var.lambda.runtime
    s3_bucket                 = var.lambda.s3_bucket
    s3_key                    = var.lambda.s3_key
    s3_object_version         = var.lambda.s3_object_version
    security_group_ids        = var.lambda.security_group_ids
    subnet_ids                = var.lambda.subnet_ids
    tags                      = var.lambda.tags
    timeout                   = var.lambda.timeout
    tracing_config            = var.lambda.tracing_config
  }
}


resource "aws_cloudwatch_event_rule" "spot_instance_termination" {
  name        = "spot-instance-termination"
  description = "Spot Instance Termination Warning"

  event_pattern = <<EOF
{
  "source": ["aws.ec2"],
  "detail-type": ["EC2 Spot Instance Interruption Warning"]
}
EOF
}

resource "aws_cloudwatch_event_target" "main" {
  rule = aws_cloudwatch_event_rule.spot_instance_termination.name
  arn  = module.spot_termination_warning_watcher.lambda.function.arn
}

resource "aws_lambda_permission" "main" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = module.spot_termination_warning_watcher.lambda.function.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.spot_instance_termination.arn
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "lambda-policy"
  role = module.spot_termination_warning_watcher.lambda.role.name

  policy = templatefile("${path.module}/policies/lambda.json", {})
}
