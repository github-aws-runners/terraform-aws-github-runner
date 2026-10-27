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

  mock_resource "aws_s3_bucket" {
    defaults = {
      arn = "arn:aws:s3:::test-runner-binaries"
      id  = "test-runner-binaries"
    }
  }

  mock_resource "aws_apigatewayv2_api" {
    defaults = {
      execution_arn = "arn:aws:execute-api:eu-west-1:123456789012:test"
    }
  }
}

mock_provider "random" {}
mock_provider "null" {}

variables {
  aws_region = "eu-west-1"
  vpc_id     = "vpc-test"
  subnet_ids = ["subnet-test"]

  multi_runner_config = {}

  github_app = {
    key_base64_ssm = {
      arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/tests/github-app/key"
      name = "/tests/github-app/key"
    }
    id_ssm = {
      arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/tests/github-app/id"
      name = "/tests/github-app/id"
    }
    webhook_secret_ssm = {
      arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/tests/github-app/webhook-secret"
      name = "/tests/github-app/webhook-secret"
    }
  }

  lambda_s3_bucket      = "test-lambda-artifacts"
  runners_lambda_zip    = "README.md"
  runners_lambda_s3_key = "runners.zip"
  webhook_lambda_s3_key = "webhook.zip"
  syncer_lambda_s3_key  = "runner-binaries-syncer.zip"
}

run "matcher_config_chunk_names_include_config_hash" {
  command = apply

  variables {
    multi_runner_config = {
      stable = {
        runner_config = {
          runner_os             = "linux"
          runner_architecture   = "x64"
          instance_types        = ["m5.large"]
          runners_maximum_count = 1
        }
        matcherConfig = {
          labelMatchers = [["first-label"]]
        }
      }
    }
  }

  assert {
    condition = alltrue([
      for path in split(":", output.webhook.lambda.environment[0].variables["PARAMETER_RUNNER_MATCHER_CONFIG_PATH"]) :
      can(regex("/runner-matcher-config-[0-9a-f]{12}-[0-9]+$", path))
    ])
    error_message = "Matcher config chunk names must contain the config hash and the chunk index."
  }
}

run "unchanged_matcher_config_keeps_chunk_names" {
  command = apply

  variables {
    multi_runner_config = {
      stable = {
        runner_config = {
          runner_os             = "linux"
          runner_architecture   = "x64"
          instance_types        = ["m5.large"]
          runners_maximum_count = 1
        }
        matcherConfig = {
          labelMatchers = [["first-label"]]
        }
      }
    }
  }

  assert {
    condition     = output.webhook.lambda.environment[0].variables["PARAMETER_RUNNER_MATCHER_CONFIG_PATH"] == run.matcher_config_chunk_names_include_config_hash.webhook.lambda.environment[0].variables["PARAMETER_RUNNER_MATCHER_CONFIG_PATH"]
    error_message = "An unchanged matcher config must keep the same chunk names."
  }
}

run "changed_matcher_config_uses_new_chunk_names" {
  command = apply

  variables {
    multi_runner_config = {
      stable = {
        runner_config = {
          runner_os             = "linux"
          runner_architecture   = "x64"
          instance_types        = ["m5.large"]
          runners_maximum_count = 1
        }
        matcherConfig = {
          labelMatchers = [["second-label"]]
        }
      }
    }
  }

  assert {
    condition     = output.webhook.lambda.environment[0].variables["PARAMETER_RUNNER_MATCHER_CONFIG_PATH"] != run.matcher_config_chunk_names_include_config_hash.webhook.lambda.environment[0].variables["PARAMETER_RUNNER_MATCHER_CONFIG_PATH"]
    error_message = "A changed matcher config must use new chunk names."
  }
}

run "changed_parameter_tier_uses_new_chunk_names" {
  command = apply

  variables {
    matcher_config_parameter_store_tier = "Advanced"
    multi_runner_config = {
      stable = {
        runner_config = {
          runner_os             = "linux"
          runner_architecture   = "x64"
          instance_types        = ["m5.large"]
          runners_maximum_count = 1
        }
        matcherConfig = {
          labelMatchers = [["first-label"]]
        }
      }
    }
  }

  assert {
    condition     = output.webhook.lambda.environment[0].variables["PARAMETER_RUNNER_MATCHER_CONFIG_PATH"] != run.matcher_config_chunk_names_include_config_hash.webhook.lambda.environment[0].variables["PARAMETER_RUNNER_MATCHER_CONFIG_PATH"]
    error_message = "A changed parameter tier must use new chunk names."
  }
}
