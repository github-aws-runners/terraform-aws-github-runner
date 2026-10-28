mock_provider "aws" {
  mock_data "aws_iam_policy_document" { defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" } }
  mock_resource "aws_iam_role" { defaults = { arn = "arn:aws:iam::123456789012:role/test" } }
  mock_resource "aws_lambda_function" { defaults = { arn = "arn:aws:lambda:eu-west-1:123456789012:function:test" } }
  mock_resource "aws_cloudwatch_event_rule" { defaults = { arn = "arn:aws:events:eu-west-1:123456789012:rule/test" } }
  mock_resource "aws_sqs_queue" { defaults = { arn = "arn:aws:sqs:eu-west-1:123456789012:test", url = "https://sqs.eu-west-1.amazonaws.com/123456789012/test" } }
}

variables {
  config = {
    prefix                       = "test"
    s3_bucket                    = "artifacts"
    s3_key                       = "termination-watcher.zip"
    runtime                      = "nodejs24.x"
    timeout                      = 60
    memory_size                  = 256
    architecture                 = "arm64"
    tag_filters                  = { "ghr:environment" = "test" }
    enable_runner_deregistration = true
    github_app_kms_key_arn       = "arn:aws:kms:eu-west-1:123456789012:key/11111111-1111-1111-1111-111111111111"
    github_app_parameters = {
      id                            = { name = "/app/id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/id" }
      key_base64                    = { name = "/app/key", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/key" }
      additional_apps_manifest      = { name = "/app/manifest", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/manifest" }
      additional_app_parameter_arns = ["arn:aws:ssm:eu-west-1:123456789012:parameter/app/extra/id", "arn:aws:ssm:eu-west-1:123456789012:parameter/app/extra/key", "arn:aws:ssm:eu-west-1:123456789012:parameter/app/extra/installation-id"]
    }
  }
}

run "decrypt_scoped_to_configured_key_for_all_roles" {
  command = apply

  assert {
    condition     = length(local.ssm_parameter_arns) == 6
    error_message = "The primary, additional-App and manifest parameters must all be readable."
  }

  assert {
    condition     = length(jsondecode(local.ssm_policy_json).Statement) == 2
    error_message = "The credential policy must hold one SSM statement and one KMS statement."
  }

  assert {
    condition = (
      toset(jsondecode(local.ssm_policy_json).Statement[0].Action) == toset(["ssm:GetParameter", "ssm:GetParameters"])
      && toset(jsondecode(local.ssm_policy_json).Statement[0].Resource) == toset(local.ssm_parameter_arns)
    )
    error_message = "Both SSM actions must be granted on every credential parameter."
  }

  assert {
    condition = (
      jsondecode(local.ssm_policy_json).Statement[1].Action == ["kms:Decrypt"]
      && jsondecode(local.ssm_policy_json).Statement[1].Resource == [var.config.github_app_kms_key_arn]
    )
    error_message = "kms:Decrypt must be scoped to exactly the configured key."
  }

  assert {
    condition     = output.spot_termination_handler != null && output.spot_termination_notification != null && output.deregister_retry != null
    error_message = "The handler, notification and deregister-retry roles must all receive the credential policy."
  }
}

run "no_key_grants_only_ssm" {
  command = plan

  variables {
    config = {
      prefix                       = "test"
      s3_bucket                    = "artifacts"
      s3_key                       = "termination-watcher.zip"
      runtime                      = "nodejs24.x"
      timeout                      = 60
      memory_size                  = 256
      architecture                 = "arm64"
      tag_filters                  = { "ghr:environment" = "test" }
      enable_runner_deregistration = true
      github_app_parameters = {
        id         = { name = "/app/id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/id" }
        key_base64 = { name = "/app/key", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/key" }
      }
    }
  }

  assert {
    condition     = length(jsondecode(local.ssm_policy_json).Statement) == 1 && length(local.ssm_parameter_arns) == 2
    error_message = "Without a key only the SSM read statement on the primary parameters is expected."
  }
}

run "single_app_with_key" {
  command = plan

  variables {
    config = {
      prefix                       = "test"
      s3_bucket                    = "artifacts"
      s3_key                       = "termination-watcher.zip"
      runtime                      = "nodejs24.x"
      timeout                      = 60
      memory_size                  = 256
      architecture                 = "arm64"
      tag_filters                  = { "ghr:environment" = "test" }
      enable_runner_deregistration = true
      github_app_kms_key_arn       = "arn:aws:kms:eu-west-1:123456789012:key/11111111-1111-1111-1111-111111111111"
      github_app_parameters = {
        id         = { name = "/app/id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/id" }
        key_base64 = { name = "/app/key", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/key" }
      }
    }
  }

  assert {
    condition     = length(local.ssm_parameter_arns) == 2 && jsondecode(local.ssm_policy_json).Statement[1].Resource == [var.config.github_app_kms_key_arn]
    error_message = "Single-App deployments must keep two parameters and gain decryption on the key."
  }
}

run "deregistration_disabled_grants_nothing" {
  command = plan

  variables {
    config = {
      prefix                       = "test"
      features                     = { enable_spot_termination_handler = false, enable_spot_termination_notification_watcher = false }
      enable_runner_deregistration = false
      github_app_kms_key_arn       = "arn:aws:kms:eu-west-1:123456789012:key/11111111-1111-1111-1111-111111111111"
      tag_filters                  = {}
    }
  }

  assert {
    condition     = length(local.ssm_parameter_arns) == 0 && length(aws_iam_role_policy.deregister_retry_ssm) == 0 && output.deregister_retry == null
    error_message = "Disabled deregistration must not attach any credential policy."
  }
}

run "plans_with_key_unknown_until_apply" {
  command = plan

  module {
    source = "./tests/fixtures/computed-kms"
  }

  assert {
    condition     = output.deregistration_enabled
    error_message = "A key known only after apply must not break planning."
  }
}
