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

  experimental_global_config_github = {
    app = {
      key_base64     = "experimental-app-key"
      id             = "experimental-app-id"
      webhook_secret = "experimental-webhook-secret"
    }
  }

  experimental_global_config_lambda = {
    artifact = {
      s3 = {
        bucket = "test-lambda-artifacts"
      }
    }
  }

  experimental_global_config_orchestration_provider = {
    webhook = {
      lambda = {
        artifact = {
          s3 = {
            key = "runners.zip"
          }
        }
        webhook = {
          artifact = {
            s3 = {
              key = "webhook.zip"
            }
          }
        }
      }
    }
  }

  experimental_global_config_ssm = {
    housekeeper = {
      lambda = {
        artifact = {
          s3 = {
            key = "runners.zip"
          }
        }
      }
    }
  }

  experimental_global_config_compute_provider = {
    aws = {
      ec2 = {
        runner_binaries = {
          syncer = {
            artifact = {
              s3 = {
                key = "runner-binaries-syncer.zip"
              }
            }
          }
        }
      }
    }
  }
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

  assert {
    condition = (
      keys(module.runners) == ["stable"]
      && length(module.runner_configs) == 0
      && keys(output.runners_map) == ["stable"]
      && length(output.runners_map_v2) == 0
    )
    error_message = "Stable v1 configurations must route through module.runners and not the experimental runner-config module."
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
          instance_termination_watcher = {
            features = {
              runner_deregistration = {
                enabled = false
              }
              spot_termination_handler = {
                enabled = false
              }
              spot_termination_notification_watcher = {
                enabled = false
              }
            }
          }
          runner_binaries = {
            enabled = false
            syncer = {
              artifact = {
                s3 = {
                  key = "runner-binaries-syncer.zip"
                }
              }
            }
          }
        }
      }
    }

    experimental_global_config_observability = {
      metrics = {
        enabled = true
        metric = {
          github_app_rate_limit = {
            enabled = false
          }
          job_retry = {
            enabled = false
          }
        }
      }
    }

    experimental_global_config_orchestration_provider = {
      webhook = {
        eventbridge = {
          enabled = false
        }
        lambda = {
          artifact = {
            s3 = {
              key = "global-runners.zip"
            }
          }
          webhook = {
            artifact = {
              s3 = {
                key = "global-webhook.zip"
              }
            }
          }
        }
      }
    }

    experimental_global_config_ssm = {
      housekeeper = {
        lambda = {
          artifact = {
            s3 = {
              key = "global-housekeeper.zip"
            }
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
              labelMatchers          = [["self-hosted", "linux", "arm64"]]
              dynamic_labels_enabled = true
            }
          }
        }
        observability = {
          metrics = {
            enabled = false
            metric = {
              github_app_rate_limit = {
                enabled = true
              }
              job_retry = {
                enabled = true
              }
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
              instance_types                = ["c7g.large"]
              subnet_ids                    = ["subnet-lane"]
              on_demand_failover_for_errors = ["InsufficientInstanceCapacity"]
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
      && toset(keys(local.resolved_config.multi_runner_config)) == toset(["lane"])
      && local.resolved_config.tags.source == "v2"
      && local.resolved_config.multi_runner_config["lane"].runner.os == "linux"
      && local.resolved_config.multi_runner_config["lane"].runner.architecture == "arm64"
      && local.resolved_config.multi_runner_config["lane"].runner.group_name == "lane-group"
      && local.resolved_config.multi_runner_config["lane"].compute_provider.aws.ec2.vpc_id == "vpc-global"
      && toset(local.resolved_config.multi_runner_config["lane"].compute_provider.aws.ec2.subnet_ids) == toset(["subnet-lane"])
      && local.resolved_config.multi_runner_config["lane"].orchestration_provider.webhook.matcherConfig.dynamic_labels_enabled
      && !local.resolved_config.multi_runner_config["lane"].observability.metrics.enabled
      && local.resolved_config.multi_runner_config["lane"].observability.metrics.metric.github_app_rate_limit.enabled
      && local.resolved_config.multi_runner_config["lane"].observability.metrics.metric.job_retry.enabled
      && tolist(local.resolved_config.multi_runner_config["lane"].compute_provider.aws.ec2.on_demand_failover_for_errors) == tolist(["InsufficientInstanceCapacity"])
      && !local.resolved_config.orchestration_provider.webhook.eventbridge.enabled
      && !local.resolved_config.compute_provider.aws.ec2.instance_termination_watcher.features.spot_termination_handler.enabled
      && !local.resolved_config.compute_provider.aws.ec2.instance_termination_watcher.features.spot_termination_notification_watcher.enabled
      && !local.resolved_config.compute_provider.aws.ec2.instance_termination_watcher.features.runner_deregistration.enabled
      && local.resolved_config.multi_runner_config["lane"].ssm.housekeeper.lambda.artifact.zip == null
      && local.resolved_config.multi_runner_config["lane"].ssm.housekeeper.lambda.artifact.s3.key == "lane-housekeeper.zip"
      && toset(local.effective_config.multi_runner_config["lane"].runner.labels) == toset(["arm64", "linux", "self-hosted"])
    )
    error_message = "Experimental v2 inputs must resolve lane overrides before experimental global defaults."
  }

  assert {
    condition = (
      length(module.runners) == 0
      && keys(module.runner_configs) == ["lane"]
      && length(output.runners_map) == 0
      && keys(output.runners_map_v2) == ["lane"]
    )
    error_message = "Experimental v2 configurations must route through module.runner_configs and skip the legacy runners module."
  }
}

run "v2_inputs_do_not_require_legacy_arguments" {
  command = plan

  variables {
    github_app          = {}
    vpc_id              = null
    subnet_ids          = null
    multi_runner_config = {}
    experimental_global_config_compute_provider = {
      aws = {
        ec2 = {
          vpc_id     = "vpc-v2"
          subnet_ids = ["subnet-v2"]
          runner_binaries = {
            enabled = false
          }
        }
      }
    }
    experimental_multi_runner_config = {
      lane = {
        orchestration_provider = {
          webhook = {
            matcherConfig = {
              labelMatchers = [["self-hosted", "linux", "x64"]]
            }
          }
        }
        compute_provider = {
          aws = {
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
        }
      }
    }
  }

  assert {
    condition = (
      local.use_v2_config
      && keys(module.runner_configs) == ["lane"]
      && length(module.runners) == 0
      && local.resolved_config.multi_runner_config["lane"].compute_provider.aws.ec2.vpc_id == "vpc-v2"
    )
    error_message = "The v2 interface must work without the stable v1 GitHub App, VPC, subnet, or runner configuration inputs."
  }
}
