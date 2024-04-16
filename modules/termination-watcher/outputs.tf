output "lambda" {
  value = {
    function  = module.termination_warning_watcher.lambda
    log_group = module.termination_warning_watcher.lambda.log_group
    role      = module.termination_warning_watcher.lambda.role
  }
}
