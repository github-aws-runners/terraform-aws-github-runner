# One provider per janitor deployment. Keep provider configuration and read-only
# inventory permissions separate from shared GitHub/SQS cleanup infrastructure.
locals {
  compute_provider = {
    type    = "ec2"
    options = { regions = var.config.regions }
  }
}

data "aws_iam_policy_document" "compute" {
  statement {
    sid       = "ReadEc2Inventory"
    actions   = ["ec2:DescribeInstances"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestedRegion"
      values   = var.config.regions
    }
  }
}

resource "aws_iam_role_policy" "compute" {
  name   = "registration-janitor-compute"
  role   = module.lambda.lambda.role.name
  policy = data.aws_iam_policy_document.compute.json
}
