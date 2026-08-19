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

  multi_runner_config = {}

  lambda_s3_bucket      = "test-lambda-artifacts"
  runners_lambda_zip    = "README.md"
  runners_lambda_s3_key = "runners.zip"
  webhook_lambda_s3_key = "webhook.zip"
  syncer_lambda_s3_key  = "runner-binaries-syncer.zip"
}

run "empty_experimental_map_translates_stable_inputs" {
  command = plan

  variables {
    tags = {
      source = "stable"
    }

    role_path                 = "/stable/"
    role_permissions_boundary = "arn:aws:iam::123456789012:policy/stable-boundary"
    queue_selection_strategy  = "random"
    repository_white_list     = ["example/repository"]

    experimental = {
      tags = {
        source = "experimental-ignored"
      }
      roles = {
        path = "/experimental-ignored/"
      }
      github = {
        user_agent = "experimental-ignored"
      }
      lambda = {
        runtime = "nodejs22.x"
      }
      orchestration_provider = {
        webhook = {
          queue_selection_strategy = "first"
          github = {
            repository_white_list = ["ignored/repository"]
          }
        }
      }
      compute_provider = {
        aws = {
          ec2 = {
            vpc_id     = "vpc-experimental-ignored"
            subnet_ids = ["subnet-experimental-ignored"]
          }
        }
      }
      multi_runner_config = {}
    }

    multi_runner_config = {
      stable = {
        runner_config = {
          runner_os             = "linux"
          runner_architecture   = "x64"
          instance_types        = ["m5.large"]
          runners_maximum_count = 2
          runner_group_name     = "stable-group"
          runner_iam_role_managed_policy_arns = [
            "arn:aws:iam::123456789012:policy/stable-runner",
          ]
        }
        matcherConfig = {
          labelMatchers = [["self-hosted", "linux", "x64"]]
        }
      }
    }
  }

  assert {
    condition = (
      !local.use_multi_runner_config_v2
      && toset(keys(local.raw_translated_experimental.multi_runner_config)) == toset(["stable"])
      && tomap(local.raw_translated_experimental.tags) == tomap(var.tags)
      && local.raw_translated_experimental.roles.path == var.role_path
      && local.raw_translated_experimental.roles.permissions_boundary == var.role_permissions_boundary
      && local.raw_translated_experimental.github.app.key_base64_ssm == var.github_app.key_base64_ssm
      && local.raw_translated_experimental.github.app.id_ssm == var.github_app.id_ssm
      && local.raw_translated_experimental.github.app.webhook_secret_ssm == var.github_app.webhook_secret_ssm
      && local.raw_translated_experimental.github.user_agent == var.user_agent
      && local.raw_translated_experimental.lambda.runtime == var.lambda_runtime
      && local.raw_translated_experimental.orchestration_provider.webhook.queue_selection_strategy == var.queue_selection_strategy
      && tolist(local.raw_translated_experimental.orchestration_provider.webhook.github.repository_white_list) == tolist(var.repository_white_list)
      && local.raw_translated_experimental.compute_provider.aws.ec2.vpc_id == var.vpc_id
      && tolist(local.raw_translated_experimental.compute_provider.aws.ec2.subnet_ids) == tolist(var.subnet_ids)
    )
    error_message = "An empty experimental runner map must translate the stable global inputs into the canonical shape."
  }

  assert {
    condition = (
      local.raw_translated_experimental.multi_runner_config["stable"].runner.os == "linux"
      && local.raw_translated_experimental.multi_runner_config["stable"].runner.architecture == "x64"
      && local.raw_translated_experimental.multi_runner_config["stable"].runner.group_name == "stable-group"
      && local.raw_translated_experimental.multi_runner_config["stable"].runner.iam.managed_policy_arns["legacy-0"] == "arn:aws:iam::123456789012:policy/stable-runner"
      && local.raw_translated_experimental.multi_runner_config["stable"].orchestration_provider.webhook.runner.maximum_count == 2
      && jsonencode(local.raw_translated_experimental.multi_runner_config["stable"].orchestration_provider.webhook.matcherConfig.labelMatchers) == jsonencode([["self-hosted", "linux", "x64"]])
      && toset(local.raw_translated_experimental.multi_runner_config["stable"].compute_provider.aws.ec2.instance_types) == toset(["m5.large"])
    )
    error_message = "Stable runner entries must translate into the canonical runner, orchestration, and compute-provider blocks."
  }
}

run "non_empty_experimental_map_is_authoritative" {
  command = plan

  variables {
    tags = {
      source = "stable-ignored"
    }

    multi_runner_config = {
      stable = {
        runner_config = {
          runner_os             = "linux"
          runner_architecture   = "x64"
          instance_types        = ["m5.large"]
          runners_maximum_count = 1
        }
        matcherConfig = {
          labelMatchers = [["stable"]]
        }
      }
    }

    experimental = {
      tags = {
        source = "experimental"
      }

      multi_runner_config = {
        experimental = {
          orchestration_provider = {
            webhook = {
              matcherConfig = {
                labelMatchers = [["experimental"]]
              }
            }
          }
          compute_provider = {
            aws = {
              ec2 = {
                instance_types = ["c7g.large"]
              }
            }
          }
        }
      }
    }
  }

  assert {
    condition = (
      local.use_multi_runner_config_v2
      && toset(keys(local.raw_translated_experimental.multi_runner_config)) == toset(["experimental"])
      && local.raw_translated_experimental.tags.source == "experimental"
      && toset(local.raw_translated_experimental.multi_runner_config["experimental"].compute_provider.aws.ec2.instance_types) == toset(["c7g.large"])
      && flatten(local.raw_translated_experimental.multi_runner_config["experimental"].orchestration_provider.webhook.matcherConfig.labelMatchers) == ["experimental"]
    )
    error_message = "A non-empty experimental runner map must be authoritative and must not merge stable lanes or flat defaults."
  }

  assert {
    condition     = jsonencode(local.raw_translated_experimental) == jsonencode(var.experimental)
    error_message = "A non-empty experimental runner map must select the experimental object without leaking stable flat inputs."
  }

  assert {
    condition = (
      keys(module.runners) == ["stable"]
      && !contains(keys(module.runners), "experimental")
    )
    error_message = "This preparatory change must leave resource creation on the stable multi_runner_config path."
  }
}

run "lane_values_override_experimental_globals" {
  command = plan

  variables {
    experimental = {
      tags = {
        scope      = "global"
        precedence = "global"
      }

      runner = {
        os           = "linux"
        architecture = "x64"
        group_name   = "global-group"
        iam = {
          managed_policy_arns = {
            global = "arn:aws:iam::123456789012:policy/global-runner"
          }
          additional_trust_policy_json = "{}"
        }
      }

      orchestration_provider = {
        webhook = {
          runner = {
            maximum_count = 4
          }
        }
      }

      observability = {
        logs = {
          level             = "debug"
          retention_in_days = 30
        }
      }

      compute_provider = {
        aws = {
          ec2 = {
            vpc_id     = "vpc-experimental"
            subnet_ids = ["subnet-global"]
            tags = {
              precedence = "global"
              global     = "true"
            }
          }
        }
      }

      multi_runner_config = {
        lane = {
          tags = {
            precedence = "lane"
            lane       = "true"
          }
          runner = {
            group_name = "lane-group"
            iam = {
              role = {
                arn = "arn:aws:iam::123456789012:role/external-runner"
              }
            }
          }
          orchestration_provider = {
            webhook = {
              runner = {
                maximum_count = 7
              }
              matcherConfig = {
                labelMatchers = [["self-hosted", "linux", "x64", "lane"]]
              }
            }
          }
          observability = {
            logs = {
              level = "warn"
            }
          }
          compute_provider = {
            aws = {
              ec2 = {
                instance_types = ["m7i.large"]
                subnet_ids     = ["subnet-lane"]
                tags = {
                  precedence = "lane"
                  provider   = "lane"
                }
              }
            }
          }
        }
      }
    }
  }

  assert {
    condition = (
      local.translated_experimental_base.multi_runner_config["lane"].runner.os == "linux"
      && local.translated_experimental_base.multi_runner_config["lane"].runner.architecture == "x64"
      && local.translated_experimental_base.multi_runner_config["lane"].runner.group_name == "lane-group"
      && local.translated_experimental_base.multi_runner_config["lane"].orchestration_provider.webhook.runner.maximum_count == 7
      && local.translated_experimental_base.multi_runner_config["lane"].observability.logs.level == "warn"
      && local.translated_experimental_base.multi_runner_config["lane"].observability.logs.retention_in_days == 30
    )
    error_message = "Lane values must override experimental globals while omitted values inherit their global defaults."
  }

  assert {
    condition = (
      tomap(local.translated_experimental_base.multi_runner_config["lane"].tags) == tomap({
        scope      = "global"
        precedence = "lane"
        lane       = "true"
      })
      && local.translated_experimental_base.multi_runner_config["lane"].compute_provider.aws.ec2.vpc_id == "vpc-experimental"
      && toset(local.translated_experimental_base.multi_runner_config["lane"].compute_provider.aws.ec2.subnet_ids) == toset(["subnet-lane"])
      && tomap(local.translated_experimental_base.multi_runner_config["lane"].compute_provider.aws.ec2.tags) == tomap({
        precedence = "lane"
        global     = "true"
        provider   = "lane"
      })
    )
    error_message = "Tags and EC2 defaults must merge from experimental globals with lane values taking precedence."
  }

  assert {
    condition = (
      local.translated_experimental_base.multi_runner_config["lane"].runner.iam.role.arn == "arn:aws:iam::123456789012:role/external-runner"
      && length(local.translated_experimental_base.multi_runner_config["lane"].runner.iam.managed_policy_arns) == 0
      && local.translated_experimental_base.multi_runner_config["lane"].runner.iam.additional_trust_policy_json == null
    )
    error_message = "An externally managed runner role must suppress inherited managed policies and trust-policy additions."
  }
}
