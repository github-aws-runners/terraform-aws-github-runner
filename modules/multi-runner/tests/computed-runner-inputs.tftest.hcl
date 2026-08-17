mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/test-role"
    }
  }

  mock_resource "aws_cloudwatch_event_bus" {
    defaults = {
      arn = "arn:aws:events:eu-west-1:123456789012:event-bus/test"
    }
  }

  mock_resource "aws_cloudwatch_event_rule" {
    defaults = {
      arn = "arn:aws:events:eu-west-1:123456789012:rule/test"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:eu-west-1:123456789012:function:test"
    }
  }

  mock_resource "aws_sqs_queue" {
    defaults = {
      arn = "arn:aws:sqs:eu-west-1:123456789012:test"
    }
  }

  mock_resource "aws_apigatewayv2_api" {
    defaults = {
      execution_arn = "arn:aws:execute-api:eu-west-1:123456789012:test"
    }
  }
}

run "computed_lane_values_keep_binary_syncer_instances_plannable" {
  command = plan

  module {
    source = "./tests/fixtures/computed-runner-inputs"
  }

  assert {
    condition     = output.runner_config_keys == ["linux"]
    error_message = "Apply-time values inside a statically keyed runner configuration must not make binary-syncer module instances unknown."
  }

  assert {
    condition     = output.binaries_syncer_keys == []
    error_message = "A runner configuration with the binary syncer disabled must not create a binary-syncer module instance."
  }
}

run "computed_lane_values_keep_enabled_binary_syncer_instances_plannable" {
  command = plan

  module {
    source = "./tests/fixtures/computed-runner-inputs"
  }

  variables {
    enable_runner_binaries_syncer = true
    runner_binary_targets = {
      linux_x64 = {
        os           = "linux"
        architecture = "x64"
      }
    }
  }

  assert {
    condition     = output.runner_config_keys == ["linux"]
    error_message = "The explicit provider selection must keep runner-config dispatch plannable when unrelated lane values are known only after apply."
  }

  assert {
    condition     = output.binaries_syncer_keys == ["linux_x64"]
    error_message = "The explicit runner-binary target must create the enabled binary-syncer instance with a plan-known key."
  }
}
