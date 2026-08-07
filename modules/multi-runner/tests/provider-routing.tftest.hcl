mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }
}

mock_provider "random" {}
mock_provider "null" {}

variables {
  aws_region = "eu-west-1"
  vpc_id     = "vpc-12345678"
  subnet_ids = ["subnet-12345678"]

  github_app = {
    id             = "123456"
    key_base64     = "dGVzdA=="
    webhook_secret = "test-secret"
  }

  lambda_s3_bucket      = "lambda-artifacts"
  webhook_lambda_s3_key = "webhook.zip"
  runners_lambda_s3_key = "runners.zip"
  syncer_lambda_s3_key  = "runner-binaries-syncer.zip"
}

run "stable_v1_keeps_legacy_runner_module" {
  command = plan

  variables {
    tags = {
      StableGlobal = "global"
      Precedence   = "global"
    }

    multi_runner_config = {
      linux = {
        runner_config = {
          runner_os                     = "linux"
          runner_architecture           = "x64"
          instance_types                = ["m5.large"]
          runners_maximum_count         = 2
          enable_runner_binaries_syncer = false
          enable_organization_runners   = true
        }
        matcherConfig = {
          labelMatchers = [["self-hosted", "linux", "x64"]]
        }
        redrive_build_queue = {
          enabled         = true
          maxReceiveCount = 3
        }
      }
    }
  }

  assert {
    condition     = keys(local.runner_config_by_provider.ec2) == ["linux"]
    error_message = "Stable multi_runner_config entries must route to the EC2 provider."
  }

  assert {
    condition     = keys(local.runner_config_v1) == ["linux"] && length(local.runner_config_v2) == 0
    error_message = "Stable multi_runner_config entries must remain isolated in the v1 configuration map."
  }

  assert {
    condition = (
      contains(keys(local.runner_config_v1["linux"]), "runner_config")
      && !contains(keys(local.runner_config_v1["linux"]), "compute_provider")
      && local.runner_config_v1["linux"].runner_config.enable_organization_runners
    )
    error_message = "Stable module inputs must retain the original v1 shape instead of being reconstructed from the v1-to-v2 translation."
  }

  assert {
    condition     = keys(module.runners) == ["linux"] && length(module.runner_stacks) == 0
    error_message = "Stable multi_runner_config entries must retain the historical module.runners address."
  }

  assert {
    condition     = keys(aws_sqs_queue.queued_builds) == ["linux"]
    error_message = "Common queue ownership must preserve the stable runner configuration key."
  }

  assert {
    condition = (
      aws_sqs_queue.queued_builds["linux"].tags == var.tags
      && aws_sqs_queue.queued_builds_dlq["linux"].tags == var.tags
    )
    error_message = "Stable multi_runner_config queues must continue to receive exactly the module-level tags."
  }

  assert {
    condition     = keys(output.runners_map) == ["linux"]
    error_message = "Stable multi_runner_config must preserve the public runner map key."
  }

  assert {
    condition = toset(keys(output.runners_map["linux"])) == toset(
      [
        "launch_template_name",
        "launch_template_id",
        "launch_template_version",
        "launch_template_ami_id",
        "lambda_up",
        "lambda_up_log_group",
        "lambda_down",
        "lambda_down_log_group",
        "lambda_pool",
        "lambda_pool_log_group",
        "role_runner",
        "role_scale_up",
        "role_scale_down",
        "role_pool",
        "runners_log_groups",
        "logfiles",
      ]
    )
    error_message = "Stable multi_runner_config must retain its existing flat runners_map entry shape."
  }
}

run "experimental_v2_routes_through_provider_stack" {
  command = plan

  variables {
    experimental = {
      multi_runner_config_v2 = {
        linux = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
            hooks = {
              job_started = "/opt/actions/job-started.sh"
            }
            iam = {
              managed_policy_arns = {
                readonly = "arn:aws:iam::aws:policy/ReadOnlyAccess"
              }
            }
          }
          github = {
            organization_runners = true
          }
          scale_down = {
            idle_config = [{
              cron      = "* * * * *"
              timeZone  = "UTC"
              idleCount = 1
            }]
          }
          pool = {
            config = [{
              schedule_expression = "cron(0 8 * * ? *)"
              size                = 1
            }]
          }
          compute_provider = {
            type = "ec2"
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64"]]
          }
        }
      }
    }
  }

  assert {
    condition     = keys(local.runner_config_by_provider.ec2) == ["linux"]
    error_message = "Experimental multi_runner_config_v2 entries must route to the EC2 provider."
  }

  assert {
    condition     = length(local.runner_config_v1) == 0 && keys(local.runner_config_v2) == ["linux"]
    error_message = "Experimental multi_runner_config_v2 entries must remain isolated in the v2 configuration map."
  }

  assert {
    condition     = length(module.runners) == 0 && keys(module.runner_stacks) == ["linux"]
    error_message = "Experimental multi_runner_config_v2 entries must dispatch through module.runner_stacks."
  }

  assert {
    condition     = keys(aws_sqs_queue.queued_builds) == ["linux"]
    error_message = "Common queue ownership must preserve the experimental runner configuration key."
  }

  assert {
    condition     = keys(output.runners_map) == ["linux"]
    error_message = "Experimental multi_runner_config_v2 must preserve the public runner map key."
  }

  assert {
    condition = toset(keys(output.runners_map["linux"])) == toset(
      [
        "provider",
        "runner",
        "scale_up",
        "scale_down",
        "pool",
      ]
    )
    error_message = "Experimental v2 runners_map entries must group common and provider resources by owner."
  }

  assert {
    condition = (
      toset(keys(output.runners_map["linux"].runner)) == toset(["role"])
      && toset(keys(output.runners_map["linux"].scale_up)) == toset(["lambda", "log_group", "role"])
      && toset(keys(output.runners_map["linux"].scale_down)) == toset(["lambda", "log_group", "role"])
      && toset(keys(output.runners_map["linux"].pool)) == toset(["lambda", "log_group", "role"])
    )
    error_message = "Experimental v2 common resources must use the nested runner, scale-up, scale-down, and pool contracts."
  }

  assert {
    condition = (
      output.runners_map["linux"].provider.type == "ec2"
      && toset(keys(output.runners_map["linux"].provider.ec2)) == toset([
        "launch_template",
        "runners_log_groups",
        "logfiles",
      ])
    )
    error_message = "Experimental v2 must expose only EC2-owned resources under runners_map.<configuration>.provider.ec2."
  }

  assert {
    condition = (
      !contains(keys(output.runners_map["linux"]), "launch_template_name")
      && output.runners_map["linux"].runner.role != null
      && !contains(keys(output.runners_map["linux"].provider.ec2), "role_runner")
      && !contains(keys(output.runners_map["linux"]), "runners_log_groups")
      && !contains(keys(output.runners_map["linux"]), "logfiles")
    )
    error_message = "Experimental v2 must expose the common runner role under runner without duplicating EC2 resources."
  }

  assert {
    condition     = local.runner_config_by_provider.ec2["linux"].scale_down.idle_config[0].idleCount == 1
    error_message = "Provider-neutral idle configuration must remain in the common runner contract."
  }

  assert {
    condition     = local.runner_config_by_provider.ec2["linux"].runner.iam.managed_policy_arns.readonly == "arn:aws:iam::aws:policy/ReadOnlyAccess"
    error_message = "Runner-role policies must remain in the common runner contract."
  }

  assert {
    condition = (
      local.runner_config_by_provider.ec2["linux"].runner.hooks.job_started == "/opt/actions/job-started.sh"
      && !contains(keys(local.runner_config_by_provider.ec2["linux"].compute_provider.ec2), "hooks")
    )
    error_message = "Runner lifecycle hooks must remain in the common runner contract."
  }
}

run "experimental_v2_layers_shared_and_component_tags" {
  command = plan

  variables {
    tags = {
      GlobalOnly = "global"
      Precedence = "global"
    }

    lambda_tags = {
      SharedLambdaOnly = "shared-lambda"
      Precedence       = "shared-lambda"
    }

    experimental = {
      multi_runner_config_v2 = {
        tagged = {
          tags = {
            RunnerConfigOnly = "runner-config"
            Precedence       = "runner-config"
          }

          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
            tags = {
              RunnerOnly = "runner"
              Precedence = "runner"
            }
          }

          lambda = {
            tags = {
              ConfigLambdaOnly = "config-lambda"
              Precedence       = "config-lambda"
            }
          }

          queue = {
            redrive_build_queue = {
              enabled         = true
              maxReceiveCount = 3
            }
            tags = {
              SharedQueueOnly = "shared-queue"
              Precedence      = "shared-queue"
            }
          }

          scale_up = {
            tags = {
              ScaleUpOnly = "scale-up"
              Precedence  = "scale-up"
            }
          }

          scale_down = {
            tags = {
              ScaleDownOnly = "scale-down"
              Precedence    = "scale-down"
            }
          }

          observability = {
            logs = {
              tags = {
                SharedLogOnly = "shared-log"
                Precedence    = "shared-log"
              }
            }
          }

          compute_provider = {
            type = "ec2"
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }

          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "tagged"]]
          }
        }
      }
    }
  }

  assert {
    condition = aws_sqs_queue.queued_builds["tagged"].tags == tomap({
      GlobalOnly       = "global"
      RunnerConfigOnly = "runner-config"
      SharedQueueOnly  = "shared-queue"
      Precedence       = "shared-queue"
    })
    error_message = "Experimental v2 build queue tags must merge global, runner-configuration, and queue tags in that precedence order."
  }

  assert {
    condition = aws_sqs_queue.queued_builds_dlq["tagged"].tags == tomap({
      GlobalOnly       = "global"
      RunnerConfigOnly = "runner-config"
      SharedQueueOnly  = "shared-queue"
      Precedence       = "shared-queue"
    })
    error_message = "Experimental v2 dead-letter queue tags must use the same layered precedence as the build queue."
  }

  assert {
    condition = module.runner_stacks["tagged"].scale_up.lambda.tags == tomap({
      GlobalOnly       = "global"
      RunnerConfigOnly = "runner-config"
      SharedLambdaOnly = "shared-lambda"
      ConfigLambdaOnly = "config-lambda"
      ScaleUpOnly      = "scale-up"
      Precedence       = "scale-up"
    })
    error_message = "Scale-up Lambda tags must merge global, runner-configuration, shared Lambda, configuration Lambda, and component tags in that precedence order."
  }

  assert {
    condition = module.runner_stacks["tagged"].scale_up.log_group.tags == tomap({
      GlobalOnly       = "global"
      RunnerConfigOnly = "runner-config"
      SharedLogOnly    = "shared-log"
      ScaleUpOnly      = "scale-up"
      Precedence       = "scale-up"
    })
    error_message = "Scale-up log-group tags must merge global, runner-configuration, shared log, and component tags in that precedence order."
  }

  assert {
    condition = module.runner_stacks["tagged"].scale_up.role.tags == tomap({
      GlobalOnly       = "global"
      RunnerConfigOnly = "runner-config"
      ScaleUpOnly      = "scale-up"
      Precedence       = "scale-up"
    })
    error_message = "Scale-up role tags must merge global, runner-configuration, and component tags without Lambda- or log-only tags."
  }

  assert {
    condition = module.runner_stacks["tagged"].runner.role.tags == tomap({
      GlobalOnly       = "global"
      RunnerConfigOnly = "runner-config"
      RunnerOnly       = "runner"
      Precedence       = "runner"
    })
    error_message = "Runner role tags must merge global, runner-configuration, and runner-component tags in that precedence order."
  }

  assert {
    condition = module.runner_stacks["tagged"].scale_down.lambda.tags == tomap({
      GlobalOnly       = "global"
      RunnerConfigOnly = "runner-config"
      SharedLambdaOnly = "shared-lambda"
      ConfigLambdaOnly = "config-lambda"
      ScaleDownOnly    = "scale-down"
      Precedence       = "scale-down"
    })
    error_message = "Scale-down Lambda tags must preserve shared layers before applying scale-down component tags."
  }

  assert {
    condition = module.runner_stacks["tagged"].scale_down.log_group.tags == tomap({
      GlobalOnly       = "global"
      RunnerConfigOnly = "runner-config"
      SharedLogOnly    = "shared-log"
      ScaleDownOnly    = "scale-down"
      Precedence       = "scale-down"
    })
    error_message = "Scale-down log-group tags must preserve shared log tags before applying scale-down component tags."
  }

  assert {
    condition     = output.runners_map["tagged"].pool == null
    error_message = "Experimental v2 must expose a null pool object when no pool configuration is supplied."
  }
}

run "stable_v1_and_experimental_v2_coexist" {
  command = plan

  variables {
    multi_runner_config = {
      legacy = {
        runner_config = {
          runner_os                     = "linux"
          runner_architecture           = "x64"
          instance_types                = ["m5.large"]
          runners_maximum_count         = 2
          enable_runner_binaries_syncer = true
          enable_organization_runners   = true
        }
        matcherConfig = {
          labelMatchers = [["self-hosted", "linux", "x64"]]
        }
      }
    }

    experimental = {
      multi_runner_config_v2 = {
        experimental = {
          runner = {
            os            = "linux"
            architecture  = "arm64"
            maximum_count = 2
          }
          github = {
            organization_runners = true
          }
          compute_provider = {
            type = "ec2"
            ec2 = {
              instance_types = ["m7g.large"]
              binaries_syncer = {
                enabled = true
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "arm64", "experimental"]]
          }
        }
      }
    }
  }

  assert {
    condition     = keys(local.runner_config_v1) == ["legacy"] && keys(local.runner_config_v2) == ["experimental"]
    error_message = "Stable and experimental runner configurations must remain isolated in their respective configuration maps."
  }

  assert {
    condition     = keys(module.runners) == ["legacy"] && keys(module.runner_stacks) == ["experimental"]
    error_message = "Stable runner configurations must keep module.runners addresses while v2 configurations use module.runner_stacks."
  }

  assert {
    condition = (
      toset(keys(aws_sqs_queue.queued_builds)) == toset(["legacy", "experimental"])
      && toset(keys(local.runner_matcher_config)) == toset(["legacy", "experimental"])
    )
    error_message = "Queues and webhook routing must use the union of stable and experimental runner configuration keys."
  }

  assert {
    condition     = toset(keys(module.runner_binaries)) == toset(["linux_x64", "linux_arm64"])
    error_message = "Runner binary synchronization must include operating-system and architecture combinations from both input versions."
  }

  assert {
    condition     = toset(keys(output.runners_map)) == toset(["legacy", "experimental"])
    error_message = "The public runner map must expose both stable and experimental runner configuration keys."
  }

  assert {
    condition = toset(keys(output.runners_map["legacy"])) == toset(
      [
        "launch_template_name",
        "launch_template_id",
        "launch_template_version",
        "launch_template_ami_id",
        "lambda_up",
        "lambda_up_log_group",
        "lambda_down",
        "lambda_down_log_group",
        "lambda_pool",
        "lambda_pool_log_group",
        "role_runner",
        "role_scale_up",
        "role_scale_down",
        "role_pool",
        "runners_log_groups",
        "logfiles",
      ]
    )
    error_message = "A coexisting stable runner configuration must retain the legacy flat runners_map entry shape."
  }

  assert {
    condition     = output.runners_map["experimental"].provider.type == "ec2" && contains(keys(output.runners_map["experimental"].provider.ec2), "launch_template")
    error_message = "A coexisting v2 runner configuration must retain its nested EC2 provider output."
  }
}

run "duplicate_runner_configuration_keys_are_rejected" {
  command = plan

  variables {
    multi_runner_config = {
      duplicate = {
        runner_config = {
          runner_os                     = "linux"
          runner_architecture           = "x64"
          instance_types                = ["m5.large"]
          runners_maximum_count         = 2
          enable_runner_binaries_syncer = false
        }
        matcherConfig = {
          labelMatchers = [["self-hosted", "linux", "x64"]]
        }
      }
    }

    experimental = {
      multi_runner_config_v2 = {
        duplicate = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {
            type = "ec2"
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "experimental"]]
          }
        }
      }
    }
  }

  expect_failures = [random_string.random]
}

run "experimental_v2_rejects_future_providers" {
  command = plan

  variables {
    experimental = {
      multi_runner_config_v2 = {
        microvm = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {
            type = "microvm"
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64"]]
          }
        }
      }
    }
  }

  expect_failures = [var.experimental]
}

run "experimental_v2_rejects_profile_without_role" {
  command = plan

  variables {
    experimental = {
      multi_runner_config_v2 = {
        invalid_profile = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {
            type = "ec2"
            ec2 = {
              instance_types = ["m5.large"]
              instance_profile = {
                name = "external-profile"
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64"]]
          }
        }
      }
    }
  }

  expect_failures = [var.experimental]
}
