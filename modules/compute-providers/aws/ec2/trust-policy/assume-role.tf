data "aws_iam_policy_document" "default" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "assume_role" {
  source_policy_documents = compact([
    data.aws_iam_policy_document.default.json,
    var.additional_trust_policy_json,
  ])
}
