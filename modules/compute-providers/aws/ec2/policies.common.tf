# IAM policy documents shared by the EC2 orchestration capabilities.
data "aws_iam_policy_document" "service_linked_role" {
  count = var.config.create_service_linked_role_spot ? 1 : 0

  statement {
    effect    = "Allow"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["arn:${var.aws_partition}:iam::*:role/aws-service-role/*"]
  }
}
