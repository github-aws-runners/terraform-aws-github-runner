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
    tag_filters                  = { "ghr:environment" = "test" }
    features                     = { enable_spot_termination_handler = false, enable_spot_termination_notification_watcher = false }
    enable_runner_deregistration = true
    github_app_parameters = {
      id         = { name = "/app/id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/id" }
      key_base64 = { name = "/app/key", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/app/key" }
    }
  }
}

run "default_timeout_keeps_visibility_timeout" {
  command = plan

  assert {
    condition     = aws_sqs_queue.deregister_retry[0].visibility_timeout_seconds == 60
    error_message = "The retry queue visibility timeout must stay at 60 seconds when no Lambda timeout is set."
  }
}

run "visibility_timeout_follows_lambda_timeout" {
  command = plan

  variables {
    config = {
      prefix                       = "test"
      s3_bucket                    = "artifacts"
      s3_key                       = "termination-watcher.zip"
      runtime                      = "nodejs24.x"
      timeout                      = 300
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
    condition     = aws_sqs_queue.deregister_retry[0].visibility_timeout_seconds >= module.deregister_retry_lambda[0].lambda.function.timeout
    error_message = "The retry queue visibility timeout must not be lower than the retry Lambda timeout, or CreateEventSourceMapping fails."
  }

  assert {
    condition     = aws_sqs_queue.deregister_retry[0].visibility_timeout_seconds == 300
    error_message = "The retry queue visibility timeout must follow the configured Lambda timeout."
  }
}
