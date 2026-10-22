# Scale-set SSM policy shared with the provider-owned AMI read policy.
data "aws_iam_policy_document" "scale_set_ssm_parameters" {
  source_policy_documents = [data.aws_iam_policy_document.ami_id_ssm.json]

  dynamic "statement" {
    for_each = var.storage_provider.aws.ssm != null ? [1] : []

    content {
      sid    = "PublishRunnerJitConfiguration"
      effect = "Allow"
      actions = [
        "ssm:AddTagsToResource",
        "ssm:DeleteParameter",
        "ssm:PutParameter",
      ]
      resources = ["${local.ssm_parameter_arn_prefix}${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.tokens}/*"]
    }
  }
}
