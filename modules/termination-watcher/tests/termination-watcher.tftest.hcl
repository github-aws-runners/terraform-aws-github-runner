mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }

  mock_resource "aws_sqs_queue" {
    defaults = {
      arn = "arn:aws:sqs:eu-west-1:123456789012:termination-watcher-test"
      url = "https://sqs.eu-west-1.amazonaws.com/123456789012/termination-watcher-test"
    }
  }
}

variables {
  config = {
    prefix        = "termination-watcher-test"
    aws_partition = "aws"

    s3_bucket = "lambda-artifacts"
    s3_key    = "termination-watcher.zip"

    environment_variables = {
      CUSTOM_ENV = "preserved"
    }

    tag_filters = {
      "ghr:environment" = "test"
    }

    metrics = {
      enable    = true
      namespace = "TerminationWatcherTest"
      metric = {
        enable_spot_termination         = true
        enable_spot_termination_warning = true
      }
    }

    enable_runner_deregistration = true
    github_app_parameters = {
      id = {
        name = "/github-runner/app-id"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id"
      }
      key_base64 = {
        name = "/github-runner/key-base64"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64"
      }
    }
  }
}

run "preserves_component_environment_variables" {
  command = plan

  assert {
    condition = alltrue([
      output.spot_termination_notification.lambda.function.environment[0].variables["CUSTOM_ENV"] == "preserved",
      output.spot_termination_handler.lambda.function.environment[0].variables["CUSTOM_ENV"] == "preserved",
      output.deregister_retry.lambda.environment[0].variables["CUSTOM_ENV"] == "preserved",
    ])
    error_message = "Caller-provided environment variables must reach every termination-watcher Lambda."
  }

  assert {
    condition = (
      contains(keys(output.spot_termination_notification.lambda.function.environment[0].variables), "ENABLE_METRICS_SPOT_WARNING")
      && !contains(keys(output.spot_termination_notification.lambda.function.environment[0].variables), "ENABLE_METRICS_SPOT_TERMINATION")
      && contains(keys(output.spot_termination_handler.lambda.function.environment[0].variables), "ENABLE_METRICS_SPOT_TERMINATION")
      && !contains(keys(output.spot_termination_handler.lambda.function.environment[0].variables), "ENABLE_METRICS_SPOT_WARNING")
      && !contains(keys(output.deregister_retry.lambda.environment[0].variables), "ENABLE_METRICS_SPOT_WARNING")
      && !contains(keys(output.deregister_retry.lambda.environment[0].variables), "ENABLE_METRICS_SPOT_TERMINATION")
    )
    error_message = "Generated metric variables must remain scoped to their owning Lambda."
  }

  assert {
    condition = alltrue([
      output.spot_termination_notification.lambda.function.environment[0].variables["TAG_FILTERS"] == jsonencode(var.config.tag_filters),
      output.spot_termination_handler.lambda.function.environment[0].variables["TAG_FILTERS"] == jsonencode(var.config.tag_filters),
      output.deregister_retry.lambda.environment[0].variables["TAG_FILTERS"] == jsonencode(var.config.tag_filters),
    ])
    error_message = "Every termination-watcher Lambda must retain TAG_FILTERS."
  }
}
