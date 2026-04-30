resource "aws_ssm_parameter" "github_app_id" {
  count  = var.github_app.id_ssm != null ? 0 : 1
  name   = "${var.path_prefix}/github_app_id"
  type   = "SecureString"
  value  = var.github_app.id
  key_id = local.kms_key_arn
  tags   = var.tags

  # The AWS provider exposes `insecure_value` as a computed/optional attribute and
  # surfaces a "+ insecure_value = (known after apply)" diff on every plan for
  # SecureString params (the API never returns it). `version` similarly drifts to
  # "(known after apply)" because the provider treats it as recomputed. Neither
  # actually changes anything on apply — ignore them to silence perpetual no-op
  # drift for consumers of this module.
  lifecycle {
    ignore_changes = [insecure_value, version]
  }
}

resource "aws_ssm_parameter" "github_app_key_base64" {
  count  = var.github_app.key_base64_ssm != null ? 0 : 1
  name   = "${var.path_prefix}/github_app_key_base64"
  type   = "SecureString"
  value  = var.github_app.key_base64
  key_id = local.kms_key_arn
  tags   = var.tags

  lifecycle {
    ignore_changes = [insecure_value, version]
  }
}

resource "aws_ssm_parameter" "github_app_webhook_secret" {
  count  = var.github_app.webhook_secret_ssm != null ? 0 : 1
  name   = "${var.path_prefix}/github_app_webhook_secret"
  type   = "SecureString"
  value  = var.github_app.webhook_secret
  key_id = local.kms_key_arn
  tags   = var.tags

  lifecycle {
    ignore_changes = [insecure_value, version]
  }
}
