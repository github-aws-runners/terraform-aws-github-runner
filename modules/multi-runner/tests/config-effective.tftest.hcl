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

run "v1_effective_config_contains_derived_runner_labels" {
  command = plan

  variables {
    experimental_multi_runner_config = {}

    multi_runner_config = {
      stable = {
        runner_config = {
          runner_os             = "linux"
          runner_architecture   = "x64"
          instance_types        = ["m5.large"]
          runners_maximum_count = 1
        }
        matcherConfig = {
          labelMatchers = [["stable-label"]]
        }
      }
    }
  }

  assert {
    condition = toset(local.effective_config.multi_runner_config["stable"].runner.labels) == toset([
      "linux",
      "self-hosted",
      "stable-label",
      "x64",
    ])
    error_message = "The effective v1 configuration must contain the translated runner labels."
  }
}

run "v2_effective_config_contains_derived_values" {
  command = apply

  variables {
    experimental_global_config = {
      runner = {
        os           = "linux"
        architecture = "x64"
      }
    }

    experimental_global_config_lambda = {
      artifact = {
        s3 = {
          bucket = "global-lambda-artifacts"
        }
      }
    }

    experimental_global_config_orchestration_provider = {
      webhook = {
        lambda = {
          artifact = {
            zip = "global-webhook.zip"
          }
        }
        queue = {
          encryption = {
            kms_data_key_reuse_period_seconds = 300
            kms_master_key_id                 = "kms-global-queue"
            sqs_managed_sse_enabled           = false
          }
        }
      }
    }

    experimental_global_config_ssm = {
      kms_key_id = "kms-global-ssm"
    }

    experimental_global_config_compute_provider = {
      aws = {
        ec2 = {
          runner_binaries = {
            enabled = true
          }
        }
      }
    }

    experimental_multi_runner_config = {
      lane = {
        runner = {
          extra_labels = ["lane-label"]
        }
        orchestration_provider = {
          webhook = {
            matcherConfig = {
              labelMatchers = [["matcher-label"]]
            }
          }
        }
        compute_provider = {
          aws = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = true
              }
            }
          }
        }
      }
    }
  }

  assert {
    condition = (
      toset(local.effective_config.multi_runner_config["lane"].runner.labels) == toset([
        "lane-label",
        "linux",
        "matcher-label",
        "self-hosted",
        "x64",
      ])
      && local.effective_config.multi_runner_config["lane"].lambda.artifact.s3.bucket == "global-lambda-artifacts"
      && local.effective_config.multi_runner_config["lane"].orchestration_provider.webhook.lambda.artifact.zip == "global-webhook.zip"
      && local.effective_config.multi_runner_config["lane"].orchestration_provider.webhook.queue.kms_key_id == "kms-global-queue"
      && local.effective_config.multi_runner_config["lane"].ssm.kms_key_id == "kms-global-ssm"
      && toset(keys(local.resolved_runner_binary_targets_by_key)) == toset(["linux_x64"])
    )
    error_message = "The effective v2 configuration must contain global values, derived labels, and the resolved runner-binary target map."
  }
}
