data "aws_iam_policy_document" "default" {
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

data "aws_iam_policy_document" "assume_role" {
  source_policy_documents = compact([
    data.aws_iam_policy_document.default.json,
    var.additional_trust_policy_json,
  ])
}
