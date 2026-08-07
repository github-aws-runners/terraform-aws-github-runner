data "aws_iam_policy_document" "assume_role" {
  statement {
    effect = "Allow"
    actions = [
      "sts:AssumeRole",
      "sts:TagSession",
    ]

    principals {
      type        = "Service"
      identifiers = var.config.runner_role_trust_services
    }
  }
}

locals {
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}
