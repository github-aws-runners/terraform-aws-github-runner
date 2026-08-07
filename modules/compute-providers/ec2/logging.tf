# EC2 runner log collection and CloudWatch resources.
locals {
  runner_log_files = (
    var.config.log_files != null
    ? var.config.log_files
    : [
      {
        "prefix_log_group" : true,
        "file_path" : "/var/log/messages",
        "log_group_name" : "messages",
        "log_stream_name" : "{instance_id}",
        "log_class" : "STANDARD"
      },
      {
        "log_group_name" : "user_data",
        "prefix_log_group" : true,
        "file_path" : var.runner.os == "windows" ? "C:/UserData.log" : "/var/log/user-data.log",
        "log_stream_name" : "{instance_id}",
        "log_class" : "STANDARD"
      },
      {
        "log_group_name" : "runner",
        "prefix_log_group" : true,
        "file_path" : var.runner.os == "windows" ? "C:/actions-runner/_diag/Runner_*.log" : "/opt/actions-runner/_diag/Runner_**.log",
        "log_stream_name" : "{instance_id}",
        "log_class" : "STANDARD"
      },
      {
        "log_group_name" : "runner-startup",
        "prefix_log_group" : true,
        "file_path" : var.runner.os == "windows" ? "C:/runner-startup.log" : "/var/log/runner-startup.log",
        "log_stream_name" : "{instance_id}",
        "log_class" : "STANDARD"
      }
    ]
  )
  # CloudWatch agent collect_list schema expects log_group_class, not log_class
  logfiles = var.config.cloudwatch_agent.enabled ? [for l in local.runner_log_files : {
    "log_group_name" : l.prefix_log_group ? "/github-self-hosted-runners/${var.prefix}/${l.log_group_name}" : "/${l.log_group_name}"
    "log_stream_name" : l.log_stream_name
    "file_path" : l.file_path
    "log_group_class" : l.log_class
  }] : []

  loggroups_names = distinct([for l in local.logfiles : l.log_group_name])
  # Create a list of unique log classes corresponding to each log group name
  # This maintains the same order as loggroups_names for use with count
  loggroups_classes = [
    for name in local.loggroups_names : [
      for l in local.logfiles : l.log_group_class
      if l.log_group_name == name
    ][0]
  ]

}


resource "aws_ssm_parameter" "cloudwatch_agent_config_runner" {
  count = var.config.cloudwatch_agent.enabled ? 1 : 0
  name  = "${var.ssm.paths.root}/${var.ssm.paths.config}/cloudwatch_agent_config_runner"
  type  = "String"
  value = var.config.cloudwatch_agent.config != null ? var.config.cloudwatch_agent.config : templatefile("${path.module}/templates/cloudwatch_config.json", {
    logfiles = jsonencode(local.logfiles)
  })
  tags = local.ssm_parameter_tags
}

resource "aws_cloudwatch_log_group" "gh_runners" {
  count             = length(local.loggroups_names)
  name              = local.loggroups_names[count.index]
  retention_in_days = var.observability.logs.retention_in_days
  kms_key_id        = var.observability.logs.kms_key_id
  log_group_class   = local.loggroups_classes[count.index]
  tags              = local.log_group_tags
}
