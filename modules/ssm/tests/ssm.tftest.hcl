mock_provider "aws" {}

run "requires_webhook_secret_by_default" {
  command = plan

  variables {
    path_prefix = "/github-actions/test"
    github_app = {
      id         = "123456"
      key_base64 = "dGVzdA=="
    }
  }

  expect_failures = [var.github_app]
}

run "omits_webhook_secret_for_non_webhook_control_plane" {
  command = plan

  variables {
    path_prefix = "/github-actions/test"
    github_app = {
      id                      = "123456"
      key_base64              = "dGVzdA=="
      webhook_secret          = "unused-secret"
      webhook_secret_required = false
    }
  }

  assert {
    condition     = length(aws_ssm_parameter.github_app_webhook_secret) == 0
    error_message = "A non-webhook control plane must not create a webhook-secret parameter."
  }

  assert {
    condition     = output.parameters.github_app_webhook_secret == null
    error_message = "A non-webhook control plane must expose a null webhook-secret reference."
  }
}
