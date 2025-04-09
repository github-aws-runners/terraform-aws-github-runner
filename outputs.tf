output "runners" {
  value = {
    launch_template_name    = module.runners.launch_template.name
    launch_template_id      = module.runners.launch_template.id
    launch_template_version = module.runners.launch_template.latest_version
    launch_template_ami_id  = module.runners.launch_template.image_id
    lambda_up               = module.runners.lambda_scale_up
    lambda_up_log_group     = module.runners.lambda_scale_up_log_group
    lambda_down             = module.runners.lambda_scale_down
    lambda_down_log_group   = module.runners.lambda_scale_down_log_group
    lambda_pool             = module.runners.lambda_pool
    lambda_pool_log_group   = module.runners.lambda_pool_log_group
    role_runner             = module.runners.role_runner
    role_scale_up           = module.runners.role_scale_up
    role_scale_down         = module.runners.role_scale_down
    role_pool               = module.runners.role_pool
    runners_log_groups      = module.runners.runners_log_groups
    labels                  = local.runner_labels
    logfiles                = module.runners.logfiles
  }
}

output "binaries_syncer" {
  value = var.enable_runner_binaries_syncer ? {
    lambda           = module.runner_binaries[0].lambda
    lambda_log_group = module.runner_binaries[0].lambda_log_group
    lambda_role      = module.runner_binaries[0].lambda_role
    location         = "s3://${module.runner_binaries[0].bucket.id}/${module.runner_binaries[0].runner_distribution_object_key}"
    bucket           = module.runner_binaries[0].bucket
  } : null
}

output "webhook" {
  value = {
    gateway          = module.webhook.gateway
    lambda           = module.webhook.lambda
    lambda_log_group = module.webhook.lambda_log_group
    lambda_role      = module.webhook.role
    endpoint         = "${module.webhook.gateway.api_endpoint}/${module.webhook.endpoint_relative_path}"
    webhook          = module.webhook.webhook
    dispatcher       = var.eventbridge.enable ? module.webhook.dispatcher : null
    eventbridge      = var.eventbridge.enable ? module.webhook.eventbridge : null
  }
}

output "ssm_parameters" {
  value = { for k, v in local.github_app_parameters : k => {
    name = v.name
    arn  = v.arn
    }
  }
}


output "queues" {
  description = "SQS queues."
  value = {
    build_queue_arn     = aws_sqs_queue.queued_builds.arn
    build_queue_dlq_arn = var.redrive_build_queue.enabled ? aws_sqs_queue.queued_builds_dlq[0].arn : null
  }
}

output "instance_termination_watcher" {
  value = var.instance_termination_watcher.enable && var.instance_termination_watcher.features.enable_spot_termination_notification_watcher ? {
    lambda           = module.instance_termination_watcher[0].spot_termination_notification.lambda
    lambda_log_group = module.instance_termination_watcher[0].spot_termination_notification.lambda_log_group
    lambda_role      = module.instance_termination_watcher[0].spot_termination_notification.lambda_role
  } : null
}

output "instance_termination_handler" {
  value = var.instance_termination_watcher.enable && var.instance_termination_watcher.features.enable_spot_termination_handler ? {
    lambda           = module.instance_termination_watcher[0].spot_termination_handler.lambda
    lambda_log_group = module.instance_termination_watcher[0].spot_termination_handler.lambda_log_group
    lambda_role      = module.instance_termination_watcher[0].spot_termination_handler.lambda_role
  } : null
}

output "deprecated_variables_warning" {
  description = "Warning for deprecated variables usage. These variables will be removed in a future release. Please migrate to using the consolidated 'ami' object."
  value = join("", [
    # Show object migration warning only when ami is null and old variables are used
    var.ami == null ? join("", [
      (var.ami_filter != { state = ["available"] } || var.ami_owners != ["amazon"] || var.ami_kms_key_arn != null) ?
      "DEPRECATION WARNING: You are using the deprecated AMI variables (ami_filter, ami_owners, ami_kms_key_arn). These variables will be removed in a future version. Please migrate to using the consolidated 'ami' object.\n" : "",
    ]) : "",
    # Always show warning for ami_id_ssm_parameter_name to migrate to ami_id_ssm_parameter_arn
    var.ami_id_ssm_parameter_name != null ? "DEPRECATION WARNING: The variable 'ami_id_ssm_parameter_name' is deprecated and will be removed in a future version. Please use 'ami.id_ssm_parameter_arn' instead.\n" : ""
  ])
}
