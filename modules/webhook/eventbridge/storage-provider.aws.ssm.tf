resource "aws_iam_role_policy" "webhook_ssm" {
  name = "publish-ssm-policy"
  role = aws_iam_role.webhook_lambda.name

  policy = var.config.storage_provider.aws.ssm != null ? templatefile("${path.module}/../policies/lambda-ssm.json", {
    resource_arns = jsonencode([var.config.github_app_parameters.webhook_secret.arn])
    }) : jsonencode({
    Version   = "2012-10-17"
    Statement = []
  })
}

resource "aws_iam_role_policy" "webhook_kms" {
  count = var.config.storage_provider.aws.ssm != null ? 1 : 0

  name = "kms-policy"
  role = aws_iam_role.webhook_lambda.name

  policy = templatefile("${path.module}/../policies/lambda-kms.json", {
    kms_key_arn = var.config.storage_provider.aws.ssm.kms_key_id != null ? var.config.storage_provider.aws.ssm.kms_key_id : "arn:${var.config.aws_partition}:kms:::CMK_NOT_IN_USE"
  })
}

resource "aws_iam_role_policy" "dispatcher_kms" {
  count = var.config.storage_provider.aws.ssm != null ? 1 : 0

  name = "kms-policy"
  role = aws_iam_role.dispatcher_lambda.name

  policy = templatefile("${path.module}/../policies/lambda-kms.json", {
    kms_key_arn = var.config.storage_provider.aws.ssm.kms_key_id != null ? var.config.storage_provider.aws.ssm.kms_key_id : "arn:${var.config.aws_partition}:kms:::CMK_NOT_IN_USE"
  })
}

resource "aws_iam_role_policy" "dispatcher_ssm" {
  name = "publish-ssm-policy"
  role = aws_iam_role.dispatcher_lambda.name

  policy = var.config.storage_provider.aws.ssm != null ? templatefile("${path.module}/../policies/lambda-ssm.json", {
    resource_arns = jsonencode(
      concat(
        [for p in var.config.ssm_parameter_runner_matcher_config : p.arn]
      )
    )
    }) : jsonencode({
    Version   = "2012-10-17"
    Statement = []
  })
}

moved {
  from = aws_iam_role_policy.dispatcher_kms
  to   = aws_iam_role_policy.dispatcher_kms[0]
}

moved {
  from = aws_iam_role_policy.webhook_kms
  to   = aws_iam_role_policy.webhook_kms[0]
}

locals {
  ssm_environment_variables = var.config.storage_provider.aws.ssm != null ? {
    PARAMETER_GITHUB_APP_WEBHOOK_SECRET  = var.config.github_app_parameters.webhook_secret.name
    PARAMETER_RUNNER_MATCHER_CONFIG_PATH = join(":", [for p in var.config.ssm_parameter_runner_matcher_config : p.name])
  } : {}

  ssm_dispatcher_environment_variables = var.config.storage_provider.aws.ssm != null ? {
    PARAMETER_RUNNER_MATCHER_CONFIG_PATH = join(":", [for p in var.config.ssm_parameter_runner_matcher_config : p.name])
    PARAMETER_RUNNER_MATCHER_VERSION     = join(":", [for p in var.config.ssm_parameter_runner_matcher_config : p.version])
  } : {}
}
