locals {
  tags = merge(var.tags, {
    "ghr:environment" = var.prefix
  })

  github_app_parameters = {
    id         = module.ssm.parameters.github_app_id
    key_base64 = module.ssm.parameters.github_app_key_base64
  }

  default_runner_labels = "self-hosted"
}

resource "random_string" "random" {
  length  = 24
  special = false
  upper   = false
}
