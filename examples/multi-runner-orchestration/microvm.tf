resource "aws_cloudwatch_log_group" "aws_cloudwatch_log_group_microvm" {
  name = "/aws/lambda/microvms/ubuntu24"
}

resource "aws_ecr_repository" "base_ubuntu24" {
  name         = "base-ubuntu24"
  force_delete = true
}


data "aws_iam_policy_document" "ecr_repository_policy" {

  statement {
    effect = "Allow"
    actions = [
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:DescribeImages",
      "ecr:GetAuthorizationToken",
      "ecr:ListImages"
    ]

    principals {
      type        = "AWS"
      identifiers = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_ecr_repository_policy" "repository_policy" {
  repository = "base-ubuntu24"
  policy     = data.aws_iam_policy_document.ecr_repository_policy.json
}


locals {
  network_connectors = {
    ministack = {
      name       = "ministack"
      vpc_id     = module.base.vpc.vpc_id
      subnet_ids = module.base.vpc.private_subnets
    }
  }
}

data "aws_caller_identity" "current" {}

module "microvm_foundation" {
  source = "../../modules/microvm-foundation"

  aws_region = var.aws_region
  tags = {
    Component = "microvm-foundation"
  }
  build_policy_name_prefix                    = "gha-microvm-build-policy-"
  build_role_name_prefix                      = "gha-microvm-build-"
  network_connector_operator_role_name_prefix = "gha-microvm-network-operator-"
  usage_policy_name_prefix                    = "gha-microvm-runtime-usage-policy-"
  artifact_bucket_name                        = "ministack-microvm-artifacts-${var.aws_region}"
  artifact_retention_days                     = 30
  image_name_prefix                           = "gha-ubuntu-arm64"
  ecr_repository_arns                         = ["arn:aws:ecr:${var.aws_region}:${data.aws_caller_identity.current.account_id}:repository/base-ubuntu24"]
  network_connectors                          = local.network_connectors
  force_destroy_artifact_bucket               = true
}

locals {
  microvm = {
    ecr_repo           = aws_ecr_repository.base_ubuntu24.repository_url
    log_group          = aws_cloudwatch_log_group.aws_cloudwatch_log_group_microvm.name
    microvm_foundation = module.microvm_foundation
  }
}