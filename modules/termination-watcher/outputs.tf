output "spot_termination_notification" {
  value = var.config.features.enable_spot_termination_notification_watcher ? {
    lambda           = module.termination_notification[0].lambda.function
    lambda_log_group = module.termination_notification[0].lambda.log_group
    lambda_role      = module.termination_notification[0].lambda.role
  } : null
}

output "spot_termination_handler" {
  value = var.config.features.enable_spot_termination_handler ? {
    lambda           = module.termination_handler[0].lambda.function
    lambda_log_group = module.termination_handler[0].lambda.log_group
    lambda_role      = module.termination_handler[0].lambda.role
  } : null
}
