locals {
  tags = merge(var.tags, {
    "ghr:environment" = var.prefix
  })

  github_app_parameters = {
    id         = module.ssm.parameters.github_app_id
    key_base64 = module.ssm.parameters.github_app_key_base64
  }

  default_runner_labels = "self-hosted"

  supported_os_types      = toset([for index, queue in var.sqs_build_queue_by_runner_os : queue["os_config"]["runner_os_type"]])
  supported_architectures = toset([for index, queue in var.sqs_build_queue_by_runner_os : queue["os_config"]["runner_architecture"]])
}

resource "random_string" "random" {
  length  = 24
  special = false
  upper   = false
}
