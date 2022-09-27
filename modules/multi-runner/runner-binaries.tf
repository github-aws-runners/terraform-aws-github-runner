module "runner_binaries" {
  source   = "../runner-binaries-syncer"
  count = length(local.unique_os_types)
  prefix   = var.prefix
  tags     = local.tags

  distribution_bucket_name = "${var.prefix}-dist-${random_string.random.result}"

  runner_os                        = local.unique_os_types[count.index]["os_type"]
  runner_architecture              = local.unique_os_types[count.index]["archiecture"]
  runner_allow_prerelease_binaries = var.runner_allow_prerelease_binaries

  lambda_s3_bucket                = var.lambda_s3_bucket
  syncer_lambda_s3_key            = var.syncer_lambda_s3_key
  syncer_lambda_s3_object_version = var.syncer_lambda_s3_object_version
  lambda_runtime                  = var.lambda_runtime
  lambda_architecture             = var.lambda_architecture
  lambda_zip                      = var.runner_binaries_syncer_lambda_zip
  lambda_timeout                  = var.runner_binaries_syncer_lambda_timeout
  logging_retention_in_days       = var.logging_retention_in_days
  logging_kms_key_id              = var.logging_kms_key_id

  server_side_encryption_configuration = var.runner_binaries_s3_sse_configuration

  role_path                 = var.role_path
  role_permissions_boundary = var.role_permissions_boundary

  log_type  = var.log_type
  log_level = var.log_level

  lambda_principals = var.lambda_principals
}