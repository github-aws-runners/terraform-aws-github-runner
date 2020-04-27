resource "aws_iam_policy" "lambda_logging" {
  name        = "${var.environment}-lamda-logging-policy"
  description = "Lambda logging policy"

  policy = templatefile("${path.module}/policies/lambda-cloudwatch.json", {})
}

data "aws_iam_policy_document" "lambda_assume_role_policy" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}
