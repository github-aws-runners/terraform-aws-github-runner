resource "aws_iam_policy" "lambda_logging" {
  name        = "${var.environment}-lamda-logging-policy"
  description = "Lambda logging policy"

  policy = templatefile("${path.module}/policies/lambda-cloudwatch.json", {})
}
