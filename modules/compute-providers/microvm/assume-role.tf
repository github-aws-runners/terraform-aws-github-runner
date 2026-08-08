data "aws_iam_policy_document" "assume_role" {
  statement {
    effect = "Allow"
    actions = [
      "sts:AssumeRole",
      "sts:TagSession",
    ]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

locals {
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
  provider_runner_role = {
    trust_policy_json = local.assume_role_policy
  }
}
