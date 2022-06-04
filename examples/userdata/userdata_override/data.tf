data "aws_iam_policy_document" "runner" {
  statement {
    effect = "Allow"

    actions = [
      "s3:List*",
      "s3:Get*",
    ]

    resources = [
      module.runners.binaries_syncer.bucket.arn,
      "${module.runners.binaries_syncer.bucket.arn}/*"
    ]
  }
}
