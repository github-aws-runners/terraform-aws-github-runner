locals {
  kms_key_arn   = var.kms_key_arn == null ? "alias/aws/ssm" : var.kms_key_arn
  resource_name = var.resource_name != null ? var.resource_name : var.environment
}
