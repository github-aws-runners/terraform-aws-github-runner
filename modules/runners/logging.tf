locals {
  runner_log_files = (
    var.runner_log_files != null
    ? var.runner_log_files
    : [
      {
        "prefix_log_group" : true,
        "file_path" : "/var/log/messages",
        "log_group_name" : "messages",
        "log_stream_name" : "{instance_id}"
      },
      {
        "log_group_name" : "user_data",
        "prefix_log_group" : true,
        "file_path" : var.runner_os == "windows" ? "C:/UserData.log" : "/var/log/user-data.log",
        "log_stream_name" : "{instance_id}"
      },
      {
        "log_group_name" : "runner",
        "prefix_log_group" : true,
        "file_path" : var.runner_os == "windows" ? "C:/actions-runner/_diag/Runner_*.log" : "/home/runners/actions-runner/_diag/Runner_**.log",
        "log_stream_name" : "{instance_id}"
      },
      {
        "log_group_name" : "runner-startup",
        "prefix_log_group" : true,
        "file_path" : var.runner_os == "windows" ? "C:/runner-startup.log" : "/var/log/runner-startup.log",
        "log_stream_name" : "{instance_id}"
      }
    ]
  )
  logfiles = var.enable_cloudwatch_agent ? [for l in local.runner_log_files : {
    "log_group_name" : l.prefix_log_group ? "/github-self-hosted-runners/${var.environment}/${l.log_group_name}" : "/${l.log_group_name}"
    "log_stream_name" : l.log_stream_name
    "file_path" : l.file_path
  }] : []

  loggroups_names = distinct([for l in local.logfiles : l.log_group_name])

}


resource "aws_ssm_parameter" "cloudwatch_agent_config_runner" {
  count = var.enable_cloudwatch_agent ? 1 : 0
  name  = "${var.environment}-cloudwatch_agent_config_runner"
  type  = "String"
  value = var.cloudwatch_config != null ? var.cloudwatch_config : templatefile("${path.module}/templates/cloudwatch_config.json", {
    logfiles = jsonencode(local.logfiles)
  })
  tags = local.tags
}

resource "aws_cloudwatch_log_group" "gh_runners" {
  count             = length(local.loggroups_names)
  name              = local.loggroups_names[count.index]
  retention_in_days = var.logging_retention_in_days
  kms_key_id        = var.logging_kms_key_id
  tags              = local.tags
}

resource "aws_iam_role_policy" "cloudwatch" {
  count = var.enable_cloudwatch_agent ? 1 : 0
  name  = "CloudWatchLogginAndMetrics"
  role  = aws_iam_role.runner.name
  policy = templatefile("${path.module}/policies/instance-cloudwatch-policy.json",
    {
      ssm_parameter_arn = aws_ssm_parameter.cloudwatch_agent_config_runner[0].arn
    }
  )
}
