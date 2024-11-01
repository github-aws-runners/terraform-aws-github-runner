
resource "null_resource" "ssm_parameter_runner_matcher_config" {
  triggers = {
    version = var.config.ssm_parameter_runner_matcher_config.version
  }
}
