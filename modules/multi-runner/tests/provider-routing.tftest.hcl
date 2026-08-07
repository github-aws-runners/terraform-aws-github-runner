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

run "empty_runner_configurations_return_empty_output_maps" {
  command = plan

  assert {
    condition     = length(output.runners_map) == 0 && length(output.runners_map_v2) == 0
    error_message = "Stable and experimental runner outputs must both be empty when no runner configurations are supplied."
  }
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
    condition     = keys(local.runner_config) == ["linux"] && length(local.runner_config_v2) == 0
    error_message = "Stable multi_runner_config entries must keep the original runner configuration and remain isolated from v2."
  }

  assert {
    condition = (
      contains(keys(local.runner_config["linux"]), "runner_config")
      && !contains(keys(local.runner_config["linux"]), "compute_provider")
      && local.runner_config["linux"].runner_config.enable_organization_runners
    )
    error_message = "Stable module inputs must retain the original local.runner_config shape instead of using the v1-to-v2 translation."
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
    condition     = length(output.runners_map_v2) == 0
    error_message = "Stable multi_runner_config must not add entries to the experimental runners_map_v2 output."
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
            ec2 = {
              instance_types = ["m5.large"]
              binaries_syncer = {
                enabled = false
              }
            }
          }
          matcherConfig = {
            labelMatchers       = [["self-hosted", "linux", "x64"]]
            enableDynamicLabels = true
            awsDynamicLabelsPolicy = {
              blocked_keys = ["image-id"]
              restricted_keys = {
                "instance-type" = {
                  allowed = ["m5.*", "c5.*"]
                  denied  = ["*.metal"]
                }
                "ebs-volume-size" = {
                  max = 200
                }
              }
            }
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
    condition = (
      local.compute_provider_types["linux"] == "ec2"
      && local.runner_matcher_config["linux"].runnerProvider == "ec2"
    )
    error_message = "Compute-provider selection must supply the webhook routing contract."
  }

  assert {
    condition     = length(local.runner_config) == 0 && keys(local.runner_config_v2) == ["linux"]
    error_message = "Experimental multi_runner_config_v2 entries must remain isolated in the v2 configuration map."
  }

  assert {
    condition     = toset(local.runner_config_v2["linux"].runner.extra_labels) == toset(["self-hosted", "linux", "x64"])
    error_message = "Experimental runner labels must include labels declared by its matcher configuration."
  }

  assert {
    condition = (
      local.runner_matcher_config["linux"].matcherConfig.awsDynamicLabelsPolicy.blocked_keys == tolist(["image-id"])
      && local.runner_matcher_config["linux"].matcherConfig.awsDynamicLabelsPolicy.restricted_keys["instance-type"].allowed == tolist(["m5.*", "c5.*"])
      && local.runner_matcher_config["linux"].matcherConfig.awsDynamicLabelsPolicy.restricted_keys["instance-type"].denied == tolist(["*.metal"])
      && local.runner_matcher_config["linux"].matcherConfig.awsDynamicLabelsPolicy.restricted_keys["ebs-volume-size"].max == "200"
    )
    error_message = "Experimental matcher config must preserve the typed AWS dynamic-label policy contract."
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
    condition     = length(output.runners_map) == 0
    error_message = "Experimental multi_runner_config_v2 must not add nested entries to the stable runners_map output."
  }

  assert {
    condition     = keys(output.runners_map_v2) == ["linux"]
    error_message = "Experimental multi_runner_config_v2 must expose its runner configuration key through runners_map_v2."
  }

  assert {
    condition = toset(keys(output.runners_map_v2["linux"])) == toset(
      [
        "provider",
        "runner",
        "scale_up",
        "scale_down",
        "pool",
      ]
    )
    error_message = "Experimental v2 runners_map_v2 entries must group common and provider resources by owner."
  }

  assert {
    condition = (
      toset(keys(output.runners_map_v2["linux"].runner)) == toset(["role"])
      && toset(keys(output.runners_map_v2["linux"].scale_up)) == toset(["lambda", "log_group", "role"])
      && toset(keys(output.runners_map_v2["linux"].scale_down)) == toset(["lambda", "log_group", "role"])
      && toset(keys(output.runners_map_v2["linux"].pool)) == toset(["lambda", "log_group", "role"])
    )
    error_message = "Experimental v2 common resources must use the nested runner, scale-up, scale-down, and pool contracts."
  }

  assert {
    condition = (
      toset(keys(output.runners_map_v2["linux"].provider)) == toset(["ec2"])
      && toset(keys(output.runners_map_v2["linux"].provider.ec2)) == toset([
        "launch_template",
        "runners_log_groups",
        "logfiles",
      ])
    )
    error_message = "Experimental v2 must expose only EC2-owned resources under runners_map_v2.<configuration>.provider.ec2."
  }

  assert {
    condition = (
      !contains(keys(output.runners_map_v2["linux"]), "launch_template_name")
      && output.runners_map_v2["linux"].runner.role != null
      && !contains(keys(output.runners_map_v2["linux"].provider.ec2), "role_runner")
      && !contains(keys(output.runners_map_v2["linux"]), "runners_log_groups")
      && !contains(keys(output.runners_map_v2["linux"]), "logfiles")
    )
    error_message = "Experimental v2 must expose only its nested schema through runners_map_v2 without legacy flat fields."
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

run "experimental_v2_routes_microvm_through_provider_stack" {
  command = plan

  variables {
    experimental = {
      multi_runner_config_v2 = {
        micro = {
          runner = {
            os            = "linux"
            architecture  = "arm64"
            maximum_count = 4
            name_prefix   = "microvm-"
          }
          pool = {
            config = [{
              schedule_expression = "cron(0 8 * * ? *)"
              size                = 2
            }]
          }
          compute_provider = {
            microvm = {
              image_identifier = "arn:aws:lambdamicrovms:eu-west-1:123456789012:image/runner"
              image_version    = "1"
              environment_variables = {
                MICROVM_CLUSTER = "runner-cluster"
              }
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "arm64", "microvm"]]
          }
        }
      }
    }
  }

  assert {
    condition = (
      keys(local.runner_config_by_provider.ec2) == []
      && keys(local.runner_config_by_provider.microvm) == ["micro"]
      && local.compute_provider_types["micro"] == "microvm"
      && local.runner_matcher_config["micro"].runnerProvider == "microvm"
    )
    error_message = "Experimental multi_runner_config_v2 entries must route MicroVM lanes to the MicroVM provider."
  }

  assert {
    condition = (
      length(module.runners) == 0
      && keys(module.runner_stacks) == ["micro"]
      && length(module.runner_binaries) == 0
    )
    error_message = "MicroVM v2 lanes must dispatch through runner_stack without creating EC2 runner binaries."
  }

  assert {
    condition = (
      keys(output.runners_map_v2) == ["micro"]
      && toset(keys(output.runners_map_v2["micro"].provider)) == toset(["microvm"])
      && output.runners_map_v2["micro"].provider.microvm.image_identifier == "arn:aws:lambdamicrovms:eu-west-1:123456789012:image/runner"
      && output.runners_map_v2["micro"].provider.microvm.image_version == "1"
    )
    error_message = "MicroVM v2 lanes must expose MicroVM-owned resources under runners_map_v2.<configuration>.provider.microvm."
  }

  assert {
    condition = (
      module.runner_stacks["micro"].scale_up.lambda.environment[0].variables["RUNNER_PROVIDER_TYPE"] == "microvm"
      && module.runner_stacks["micro"].scale_up.lambda.environment[0].variables["MICROVM_IMAGE_IDENTIFIER"] == "arn:aws:lambdamicrovms:eu-west-1:123456789012:image/runner"
      && module.runner_stacks["micro"].scale_up.lambda.environment[0].variables["MICROVM_CLUSTER"] == "runner-cluster"
      && module.runner_stacks["micro"].pool.lambda.environment[0].variables["MICROVM_IMAGE_IDENTIFIER"] == "arn:aws:lambdamicrovms:eu-west-1:123456789012:image/runner"
      && !contains(keys(module.runner_stacks["micro"].scale_up.lambda.environment[0].variables), "INSTANCE_TYPES")
    )
    error_message = "MicroVM v2 lanes must pass MicroVM provider fragments to scale-up and pool without EC2 environment variables."
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
    condition     = output.runners_map_v2["tagged"].pool == null
    error_message = "Experimental v2 must expose a null pool object when no pool configuration is supplied."
  }
}

run "experimental_v2_rejects_empty_compute_provider" {
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
          compute_provider = {}
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64"]]
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental_v2_compute_provider_selection]
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

  expect_failures = [terraform_data.validate_experimental_v2_ec2["invalid_profile"]]
}

run "experimental_v2_rejects_empty_microvm_image_identifier" {
  command = plan

  variables {
    experimental = {
      multi_runner_config_v2 = {
        micro = {
          runner = {
            os            = "linux"
            architecture  = "x64"
            maximum_count = 2
          }
          compute_provider = {
            microvm = {
              image_identifier = " "
            }
          }
          matcherConfig = {
            labelMatchers = [["self-hosted", "linux", "x64", "microvm"]]
          }
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_experimental_v2_microvm["micro"]]
}
