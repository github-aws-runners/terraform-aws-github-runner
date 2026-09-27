resource "aws_ssm_parameter" "runner_matcher_config" {
  count = var.storage_provider.aws.ssm != null ? local.total_chunks : 0

  name  = "${var.storage_provider.aws.ssm.paths.root}/${var.storage_provider.aws.ssm.paths.webhook}/runner-matcher-config${local.total_chunks > 1 ? "-${count.index}" : ""}"
  type  = "String"
  value = local.matcher_json_chunks[count.index]
  tier  = var.matcher_config_parameter_store_tier
  tags  = var.tags
}