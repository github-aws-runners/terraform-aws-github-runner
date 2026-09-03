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
      arn = "arn:aws:s3:::test-lambda-artifacts"
      id  = "test-lambda-artifacts"
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
  vpc_id     = "vpc-stable"
  subnet_ids = ["subnet-stable"]

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

run "v1_stable_inputs_translate_into_effective_base" {
  command = plan

  variables {
    tags = {
      source = "v1"
    }

    experimental_global_config = {
      tags = {
        source = "v2-must-not-leak"
      }
    }

    experimental_multi_runner_config = {}

    multi_runner_config = {
      stable = {
        runner_config = {
          runner_os             = "linux"
          runner_architecture   = "x64"
          instance_types        = ["m5.large"]
          runners_maximum_count = 2
          runner_group_name     = "v1-lane"
        }
        matcherConfig = {
          labelMatchers = [["self-hosted", "linux", "x64"]]
        }
      }
    }
  }

  assert {
    condition = (
      !local.use_v2_config
      && local.normalized_config.tags.source == "v1"
      && keys(local.resolved_config.multi_runner_config) == ["stable"]
      && local.resolved_config.tags.source == "v1"
      && local.resolved_config.multi_runner_config["stable"].runner.os == "linux"
      && local.resolved_config.multi_runner_config["stable"].runner.architecture == "x64"
      && local.resolved_config.multi_runner_config["stable"].runner.group_name == "v1-lane"
      && local.resolved_config.multi_runner_config["stable"].orchestration_provider.webhook.runner.maximum_count == 2
      && toset(local.resolved_config.multi_runner_config["stable"].compute_provider.aws.ec2.instance_types) == toset(["m5.large"])
      && toset(local.effective_config.multi_runner_config["stable"].runner.labels) == toset(["linux", "self-hosted", "x64"])
    )
    error_message = "Stable v1 inputs must translate into the effective experimental base without leaking v2 globals."
  }
}

run "v2_experimental_inputs_resolve_lane_over_global" {
  command = plan

  variables {
    tags = {
      source = "v1-must-not-leak"
    }

    multi_runner_config = {
      stable = {
        runner_config = {
          runner_os                     = "windows"
          runner_architecture           = "x64"
          instance_types                = ["m5.large"]
          runners_maximum_count         = 1
          enable_runner_binaries_syncer = false
        }
        matcherConfig = {
          labelMatchers = [["stable"]]
        }
      }
    }

    experimental_global_config = {
      tags = {
        source = "v2"
      }
      runner = {
        os           = "linux"
        architecture = "arm64"
        group_name   = "global-group"
      }
    }

    experimental_global_config_compute_provider = {
      aws = {
        ec2 = {
          vpc_id     = "vpc-global"
          subnet_ids = ["subnet-global"]
        }
      }
    }

    experimental_global_config_ssm = {
      housekeeper = {
        lambda = {
          artifact = {
            zip = "global-housekeeper.zip"
          }
        }
      }
    }

    experimental_multi_runner_config = {
      lane = {
        runner = {
          group_name = "lane-group"
        }
        orchestration_provider = {
          webhook = {
            matcherConfig = {
              labelMatchers = [["self-hosted", "linux", "arm64"]]
            }
          }
        }
        ssm = {
          housekeeper = {
            lambda = {
              artifact = {
                s3 = {
                  key = "lane-housekeeper.zip"
                }
              }
            }
          }
        }
        compute_provider = {
          aws = {
            ec2 = {
              instance_types = ["c7g.large"]
              subnet_ids     = ["subnet-lane"]
            }
          }
        }
      }
    }
  }

  assert {
    condition = (
      local.use_v2_config
      && local.normalized_config.tags.source == "v2"
      && keys(local.resolved_config.multi_runner_config) == ["lane"]
      && local.resolved_config.tags.source == "v2"
      && local.resolved_config.multi_runner_config["lane"].runner.os == "linux"
      && local.resolved_config.multi_runner_config["lane"].runner.architecture == "arm64"
      && local.resolved_config.multi_runner_config["lane"].runner.group_name == "lane-group"
      && local.resolved_config.multi_runner_config["lane"].compute_provider.aws.ec2.vpc_id == "vpc-global"
      && toset(local.resolved_config.multi_runner_config["lane"].compute_provider.aws.ec2.subnet_ids) == toset(["subnet-lane"])
      && local.resolved_config.multi_runner_config["lane"].ssm.housekeeper.lambda.artifact.zip == null
      && local.resolved_config.multi_runner_config["lane"].ssm.housekeeper.lambda.artifact.s3.key == "lane-housekeeper.zip"
      && toset(local.effective_config.multi_runner_config["lane"].runner.labels) == toset(["arm64", "linux", "self-hosted"])
    )
    error_message = "Experimental v2 inputs must resolve lane overrides before experimental global defaults."
  }
}
