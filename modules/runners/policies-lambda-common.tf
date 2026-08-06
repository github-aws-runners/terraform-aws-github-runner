data "aws_iam_policy_document" "lambda_assume_role_policy" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "lambda_xray" {
  count = var.tracing_config.mode != null ? 1 : 0
  statement {
    actions = [
      "xray:BatchGetTraces",
      "xray:GetTraceSummaries",
      "xray:PutTelemetryRecords",
      "xray:PutTraceSegments"
    ]
    effect = "Allow"
    resources = [
      "*"
    ]
    sid = "AllowXRay"
  }
}
