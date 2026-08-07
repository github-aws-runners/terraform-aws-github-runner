data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "lambda_xray" {
  count = var.config.observability.tracing.mode != null ? 1 : 0

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
