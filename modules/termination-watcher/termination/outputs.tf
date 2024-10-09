output "lambda" {
  value = {
    function  = module.termination_handler.lambda
    log_group = module.termination_handler.lambda.log_group
    role      = module.termination_handler.lambda.role
  }
}
