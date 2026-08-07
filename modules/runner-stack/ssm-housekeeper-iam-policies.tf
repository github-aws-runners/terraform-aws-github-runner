# IAM policies attached to the SSM housekeeper Lambda role.
data "aws_iam_policy_document" "ssm_housekeeper" {
  statement {
    effect = "Allow"
    actions = [
      "ssm:DeleteParameter",
      "ssm:GetParametersByPath",
    ]
    resources = [
      "arn:${var.aws_partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.token_path}*",
    ]
  }
}

data "aws_iam_policy_document" "ssm_housekeeper_logging" {
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.ssm_housekeeper.arn}*"]
  }
}
