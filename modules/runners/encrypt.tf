locals {
  github_app_key_base64    = var.encryption.encrypt ? aws_kms_ciphertext.github_app_key_base64[0].ciphertext_blob : var.github_app.key_base64
  github_app_client_secret = var.encryption.encrypt ? aws_kms_ciphertext.github_app_client_secret[0].ciphertext_blob : var.github_app.client_secret
}

resource "aws_kms_ciphertext" "github_app_key_base64" {
  count     = var.encryption.encrypt ? 1 : 0
  key_id    = var.encryption.kms_key_id
  plaintext = var.github_app.key_base64

  context = {
    Environment = var.environment
  }
}

resource "aws_kms_ciphertext" "github_app_client_secret" {
  count     = var.encryption.encrypt ? 1 : 0
  key_id    = var.encryption.kms_key_id
  plaintext = var.github_app.client_secret

  context = {
    Environment = var.environment
  }
}
