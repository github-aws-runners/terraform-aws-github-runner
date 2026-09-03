resource "terraform_data" "github_app_validation" {
  lifecycle {
    precondition {
      condition = (
        var.runner_registration_level == "enterprise" ||
        (
          (var.github_app.key_base64 != null || var.github_app.key_base64_ssm != null) &&
          (var.github_app.id != null || var.github_app.id_ssm != null)
        )
      )
      error_message = "For repo/org-level runners you must set `key_base64` (or `key_base64_ssm`) and `id` (or `id_ssm`) in the `github_app` variable. These are not required when `runner_registration_level` is \"enterprise\"."
    }
  }
}

resource "aws_ssm_parameter" "github_app_id" {
  count  = var.github_app.id != null && var.github_app.id_ssm == null ? 1 : 0
  name   = "${var.path_prefix}/github_app_id"
  type   = "SecureString"
  value  = var.github_app.id
  key_id = local.kms_key_arn
  tags   = var.tags
}

resource "aws_ssm_parameter" "github_app_key_base64" {
  count  = var.github_app.key_base64 != null && var.github_app.key_base64_ssm == null ? 1 : 0
  name   = "${var.path_prefix}/github_app_key_base64"
  type   = "SecureString"
  value  = var.github_app.key_base64
  key_id = local.kms_key_arn
  tags   = var.tags
}

resource "aws_ssm_parameter" "github_app_webhook_secret" {
  count  = var.github_app.webhook_secret_ssm != null ? 0 : 1
  name   = "${var.path_prefix}/github_app_webhook_secret"
  type   = "SecureString"
  value  = var.github_app.webhook_secret
  key_id = local.kms_key_arn
  tags   = var.tags
}

resource "aws_ssm_parameter" "additional_github_app_id" {
  for_each = { for idx, app in var.additional_github_apps : idx => app if app.id_ssm == null }
  name     = "${var.path_prefix}/additional_github_app_${each.key}_id"
  type     = "SecureString"
  value    = each.value.id
  key_id   = local.kms_key_arn
  tags     = var.tags
}

resource "aws_ssm_parameter" "additional_github_app_key_base64" {
  for_each = { for idx, app in var.additional_github_apps : idx => app if app.key_base64_ssm == null }
  name     = "${var.path_prefix}/additional_github_app_${each.key}_key_base64"
  type     = "SecureString"
  value    = each.value.key_base64
  key_id   = local.kms_key_arn
  tags     = var.tags
}

resource "aws_ssm_parameter" "additional_github_app_installation_id" {
  for_each = { for idx, app in var.additional_github_apps : idx => app if app.installation_id_ssm == null && app.installation_id != null }
  name     = "${var.path_prefix}/additional_github_app_${each.key}_installation_id"
  type     = "SecureString"
  value    = each.value.installation_id
  key_id   = local.kms_key_arn
  tags     = var.tags
}

resource "aws_ssm_parameter" "enterprise_pat" {
  count  = var.enterprise_pat != null && var.enterprise_pat.pat != null && var.enterprise_pat.pat_ssm == null ? 1 : 0
  name   = "${var.path_prefix}/enterprise_pat"
  type   = "SecureString"
  value  = var.enterprise_pat.pat
  key_id = local.kms_key_arn
  tags   = var.tags
}
