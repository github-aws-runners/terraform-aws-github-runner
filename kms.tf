locals {
  kms_key_id = var.kms_key_id == null && var.encrypt_secrets ? aws_kms_key.default[0].key_id : var.kms_key_id
}

resource "aws_kms_key" "default" {
  count      = var.manage_kms_key && var.encrypt_secrets ? 1 : 0
  is_enabled = true
  tags       = local.tags
}

resource "aws_kms_alias" "default" {
  count         = var.manage_kms_key && var.encrypt_secrets ? 1 : 0
  name          = "alias/github-action-runners/${var.environment}"
  target_key_id = aws_kms_key.default[0].key_id
}
