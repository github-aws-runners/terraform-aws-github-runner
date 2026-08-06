
output "runners_map" {
  value = module.ec2.runners_map
}

output "binaries_syncer_map" {
  value = { for runner_binary_key, runner_binary in module.runner_binaries : runner_binary_key => {
    lambda           = runner_binary.lambda
    lambda_log_group = runner_binary.lambda_log_group
    lambda_role      = runner_binary.lambda_role
    location         = "s3://runner_binary.bucket.id}/runner_binary.bucket.key"
    bucket           = runner_binary.bucket
  } }
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
