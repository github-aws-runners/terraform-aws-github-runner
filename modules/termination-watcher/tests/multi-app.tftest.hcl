mock_provider "aws" {
  mock_data "aws_iam_policy_document" { defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" } }
  mock_resource "aws_iam_role" { defaults = { arn = "arn:aws:iam::123456789012:role/test" } }
  mock_resource "aws_lambda_function" { defaults = { arn = "arn:aws:lambda:eu-west-1:123456789012:function:test" } }
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
    features                     = { enable_spot_termination_handler = false, enable_spot_termination_notification_watcher = false }
    enable_runner_deregistration = true
    github_app_parameters = {
      id                            = { name = "/app/id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/id" }
      key_base64                    = { name = "/app/key", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/key" }
      additional_apps_manifest      = { name = "/app/manifest", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/manifest" }
      additional_app_parameter_arns = ["arn:aws:ssm:eu-west-1:123456789012:parameter/app/extra/key"]
    }
  }
}
run "additional_apps_reach_retry_lambda" {
  command = apply
  assert {
    condition     = output.deregister_retry.lambda.environment[0].variables["PARAMETER_GITHUB_APPS_MANIFEST_NAME"] == "/app/manifest"
    error_message = "The retry Lambda must receive the manifest."
  }
  assert {
    condition     = toset(jsondecode(aws_iam_role_policy.deregister_retry_ssm[0].policy).Statement[0].Action) == toset(["ssm:GetParameter", "ssm:GetParameters"]) && length(local.ssm_parameter_arns) == 4
    error_message = "Credential reads must support manifest and batched credential loading."
  }
}
run "disabled_deregistration" {
  command = plan
  variables {
    config = {
      prefix                       = "test"
      features                     = { enable_spot_termination_handler = false, enable_spot_termination_notification_watcher = false }
      enable_runner_deregistration = false
      tag_filters                  = {}
    }
  }
  assert {
    condition     = length(local.deregistration_env_vars) == 0 && length(local.ssm_parameter_arns) == 0
    error_message = "Disabled deregistration must not need credentials or grant access."
  }
}

run "single_app_defaults" {
  command = apply
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
      features                     = { enable_spot_termination_handler = false, enable_spot_termination_notification_watcher = false }
      enable_runner_deregistration = true
      github_app_parameters = {
        id         = { name = "/app/id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/id" }
        key_base64 = { name = "/app/key", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/key" }
      }
    }
  }
  assert {
    condition     = !contains(keys(output.deregister_retry.lambda.environment[0].variables), "PARAMETER_GITHUB_APPS_MANIFEST_NAME") && length(local.ssm_parameter_arns) == 2
    error_message = "Single-App deployments retain primary credential access without an optional manifest key."
  }
}
