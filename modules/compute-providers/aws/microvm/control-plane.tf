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
    effect    = "Allow"
    actions   = ["lambda:RunMicrovm"]
    resources = var.config.iam.resource_arns.images
  }

  statement {
    effect = "Allow"
    actions = [
      "lambda:ListTags",
      "lambda:TagResource",
      "lambda:TerminateMicrovm",
    ]
    resources = var.config.iam.resource_arns.microvms
  }

  statement {
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [var.runner.iam.role.arn]
  }
}

data "aws_iam_policy_document" "scale_down" {
  statement {
    effect    = "Allow"
    actions   = ["lambda:ListMicrovms"]
    resources = ["*"]
  }

  statement {
    effect = "Allow"
    actions = [
      "lambda:ListTags",
      "lambda:TagResource",
      "lambda:TerminateMicrovm",
      "lambda:UntagResource",
    ]
    resources = var.config.iam.resource_arns.microvms
  }
}

locals {
  microvm_environment_variables = merge(var.config.environment_variables, {
    MICROVM_EGRESS_NETWORK_CONNECTORS   = length(var.config.egress_network_connectors) == 0 ? "" : jsonencode(var.config.egress_network_connectors)
    MICROVM_EXECUTION_ROLE_ARN          = var.runner.iam.role.arn
    MICROVM_IMAGE_ARN                   = var.config.image_arn
    MICROVM_IMAGE_VERSION               = var.config.image_version == null ? "" : var.config.image_version
    MICROVM_INGRESS_NETWORK_CONNECTORS  = length(var.config.ingress_network_connectors) == 0 ? "" : jsonencode(var.config.ingress_network_connectors)
    MICROVM_LOG_GROUP                   = try(var.config.logging.log_group, null) == null ? "" : var.config.logging.log_group
    MICROVM_MAXIMUM_DURATION_IN_SECONDS = var.config.maximum_duration_in_seconds == null ? "" : tostring(var.config.maximum_duration_in_seconds)
  })

  scale_up_environment_variables   = local.microvm_environment_variables
  scale_down_environment_variables = local.microvm_environment_variables
  pool_environment_variables       = local.microvm_environment_variables
}
