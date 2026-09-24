data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    dynamic "principals" {
      for_each = var.config.lambda.role.principals

      content {
        type        = principals.value.type
        identifiers = principals.value.identifiers
      }
    }
  }
}

data "aws_iam_policy_document" "lambda_xray" {
  count = var.config.observability.tracing.mode != null ? 1 : 0

  # AWS X-Ray trace APIs do not support resource-level permissions.
  statement {
    sid    = "AllowXRay"
    effect = "Allow"
    actions = [
      "xray:BatchGetTraces",
      "xray:GetTraceSummaries",
      "xray:PutTelemetryRecords",
      "xray:PutTraceSegments",
    ]
    resources = ["*"]
  }
}

data "aws_iam_policy_document" "housekeeper" {
  dynamic "statement" {
    for_each = var.storage_provider.aws.ssm != null ? [true] : []

    content {
      effect = "Allow"
      actions = [
        "ssm:DeleteParameter",
        "ssm:GetParametersByPath",
      ]
      resources = [var.storage_provider.aws.ssm.cleanup.parameter_path_arn]
    }
  }
}

data "aws_iam_policy_document" "housekeeper_logging" {
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.housekeeper.arn}*"]
  }
}
