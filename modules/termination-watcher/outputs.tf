# output "lambda_spot_termination_warning" {
#   value = {
#     function  = module.termination_notification[0].termination_warning_watcher.lambda
#     log_group = module.termination_notification[0].outputtermination_warning_watcher.lambda.log_group
#     role      = module.termination_notification[0].module.termination_warning_watcher.lambda.role
#   }
# }



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
