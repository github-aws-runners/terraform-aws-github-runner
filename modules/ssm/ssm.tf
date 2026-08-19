resource "aws_ssm_parameter" "github_app_id" {
  count  = var.github_app.id_ssm != null ? 0 : 1
  name   = "${var.path_prefix}/github_app_id"
  type   = "SecureString"
  value  = var.github_app.id
  key_id = local.kms_key_arn
  tags   = var.tags
}

resource "aws_ssm_parameter" "github_app_key_base64" {
  count  = var.github_app.key_base64_ssm != null ? 0 : 1
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

locals {
  # Parameter names of every additional app credential, in app order. The
  # manifest keeps the lambda environment size constant regardless of the
  # number of configured apps: the lambdas receive only the manifest's
  # parameter name and resolve the per-app parameter names from its value.
  additional_apps_manifest = [
    for idx, app in var.additional_github_apps : {
      idParamName  = app.id_ssm != null ? app.id_ssm.name : aws_ssm_parameter.additional_github_app_id[tostring(idx)].name
      keyParamName = app.key_base64_ssm != null ? app.key_base64_ssm.name : aws_ssm_parameter.additional_github_app_key_base64[tostring(idx)].name
      installationIdParamName = (
        app.installation_id_ssm != null ? app.installation_id_ssm.name :
        app.installation_id != null ? aws_ssm_parameter.additional_github_app_installation_id[tostring(idx)].name :
        null
      )
    }
  ]
}

resource "aws_ssm_parameter" "additional_github_apps_manifest" {
  count = length(var.additional_github_apps) > 0 ? 1 : 0
  name  = "${var.path_prefix}/additional_github_apps_manifest"
  type  = "String"
  # Intelligent-Tiering upgrades the parameter to the advanced tier when the
  # manifest outgrows the 4KB standard tier value limit (roughly 15 apps).
  tier  = "Intelligent-Tiering"
  value = jsonencode(local.additional_apps_manifest)
  tags  = var.tags
}
