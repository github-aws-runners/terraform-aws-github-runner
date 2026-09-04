locals {
  provider_tags = merge(
    {
      "Name" = format("%s-action-runner", var.prefix)
    },
    var.tags,
  )

  log_group_tags = merge(
    local.provider_tags,
    var.observability.logs.tags,
  )

  ssm_config_ssm_path = "/${trim(var.ssm.paths.root, "/")}/${trim(var.ssm.paths.config, "/")}"
  ssm_parameter_tags = merge(
    local.provider_tags,
    var.ssm.tags,
    var.ssm.parameters.tags,
  )

  runner_log_files = var.config.log_files != null ? var.config.log_files : [
    {
      log_group_name   = "internal_service"
      prefix_log_group = true
      file_path        = "/var/log/microvm/internal-services.log"
      log_stream_name  = "{microvm_id}"
      log_class        = "STANDARD"
    },
    {
      log_group_name   = "run"
      prefix_log_group = true
      file_path        = "/var/log/microvm/run.log"
      log_stream_name  = "{microvm_id}"
      log_class        = "STANDARD"
    },
    {
      log_group_name   = "runner"
      prefix_log_group = true
      file_path        = "/opt/actions-runner/_diag/Runner_**.log"
      log_stream_name  = "{microvm_id}"
      log_class        = "STANDARD"
    },
  ]

  logfiles = var.config.cloudwatch_agent.enabled ? [for log_file in local.runner_log_files : {
    log_group_name  = log_file.prefix_log_group ? "/github-self-hosted-runners/${var.prefix}/${log_file.log_group_name}" : "/${log_file.log_group_name}"
    log_stream_name = log_file.log_stream_name
    file_path       = log_file.file_path
    log_group_class = log_file.log_class
  }] : []
  runner_log_group_names = distinct([for log_file in local.logfiles : log_file.log_group_name])
  runner_log_group_classes = [for name in local.runner_log_group_names : [
    for log_file in local.logfiles : log_file.log_group_class
    if log_file.log_group_name == name
  ][0]]
}

resource "aws_cloudwatch_log_group" "runtime" {
  name              = "/github-self-hosted-runners/${var.prefix}/microvm"
  retention_in_days = var.observability.logs.retention_in_days
  kms_key_id        = var.observability.logs.kms_key_id
  log_group_class   = var.observability.logs.class
  tags              = local.log_group_tags
}

resource "aws_ssm_parameter" "cloudwatch_agent_config_runner" {
  count = var.config.cloudwatch_agent.enabled ? 1 : 0

  name = "${local.ssm_config_ssm_path}/cloudwatch_agent_config_runner"
  type = "String"
  value = var.config.cloudwatch_agent.config != null ? var.config.cloudwatch_agent.config : templatefile(
    "${path.module}/templates/cloudwatch_config.json",
    { logfiles = jsonencode(local.logfiles) },
  )
  tags = local.ssm_parameter_tags
}

resource "aws_cloudwatch_log_group" "gh_runners" {
  count = length(local.runner_log_group_names)

  name              = local.runner_log_group_names[count.index]
  retention_in_days = var.observability.logs.retention_in_days
  kms_key_id        = var.observability.logs.kms_key_id
  log_group_class   = local.runner_log_group_classes[count.index]
  tags              = local.log_group_tags
}
