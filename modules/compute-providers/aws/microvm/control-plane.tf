data "aws_iam_policy_document" "scale_up" {
  statement {
    effect = "Allow"
    actions = [
      "lambda:ListMicrovms",
      "lambda:PassNetworkConnector",
    ]
    resources = ["*"]
  }

  statement {
    effect = "Allow"
    actions = [
      "lambda:RunMicrovm",
      "lambda:TerminateMicrovm",
    ]
    resources = local.microvm_image_resource_arns
  }

  statement {
    effect = "Allow"
    actions = [
      "ssm:DeleteParameter",
      "ssm:GetParametersByPath",
      "ssm:PutParameter",
    ]
    resources = [local.microvm_metadata_path_arn]
  }

  statement {
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [var.runner.iam.role.arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "scale_down" {
  statement {
    effect    = "Allow"
    actions   = ["lambda:ListMicrovms"]
    resources = ["*"]
  }

  statement {
    effect    = "Allow"
    actions   = ["lambda:TerminateMicrovm"]
    resources = local.microvm_image_resource_arns
  }

  statement {
    effect = "Allow"
    actions = [
      "ssm:DeleteParameter",
      "ssm:GetParametersByPath",
      "ssm:PutParameter",
    ]
    resources = [local.microvm_metadata_path_arn]
  }
}

locals {
  microvm_metadata_ssm_path = "${trimsuffix(var.ssm.paths.root, "/")}/${trim(var.ssm.paths.config, "/")}/microvm-metadata"
  microvm_metadata_path_arn = "${local.ssm_parameter_arn_prefix}${local.microvm_metadata_ssm_path}/*"
  microvm_image_resource_arns = coalesce(
    var.config.iam.resource_arns.images,
    [var.config.image_arn],
  )
  runner_jit_ssm_path = "${trimsuffix(var.ssm.paths.root, "/")}/${trim(var.ssm.paths.tokens, "/")}"

  microvm_environment_variables = merge(var.config.environment_variables, {
    MICROVM_EGRESS_NETWORK_CONNECTORS   = length(var.config.egress_network_connectors) == 0 ? "" : jsonencode(var.config.egress_network_connectors)
    MICROVM_EXECUTION_ROLE_ARN          = var.runner.iam.role.arn
    MICROVM_IMAGE_ARN                   = var.config.image_arn
    MICROVM_IMAGE_VERSION               = var.config.image_version == null ? "" : var.config.image_version
    MICROVM_INGRESS_NETWORK_CONNECTORS  = length(var.config.ingress_network_connectors) == 0 ? "" : jsonencode(var.config.ingress_network_connectors)
    MICROVM_LOG_GROUP                   = aws_cloudwatch_log_group.runtime.name
    MICROVM_MAXIMUM_DURATION_IN_SECONDS = var.config.maximum_duration_in_seconds == null ? "" : tostring(var.config.maximum_duration_in_seconds)
    MICROVM_METADATA_SSM_PATH           = local.microvm_metadata_ssm_path
  })

  scale_up_environment_variables   = local.microvm_environment_variables
  scale_down_environment_variables = local.microvm_environment_variables
  pool_environment_variables       = local.microvm_environment_variables
}
