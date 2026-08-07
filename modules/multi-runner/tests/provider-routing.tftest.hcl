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
      }
    }
  }

  assert {
    condition     = keys(local.runner_config_by_provider.ec2) == ["linux"]
    error_message = "Stable multi_runner_config lanes must route to the EC2 provider."
  }

  assert {
    condition     = keys(local.runner_config_v1) == ["linux"] && length(local.runner_config_v2) == 0
    error_message = "Stable multi_runner_config lanes must remain isolated in the v1 lane map."
  }

  assert {
    condition     = keys(module.runners) == ["linux"] && length(module.runner_stacks) == 0
    error_message = "Stable multi_runner_config lanes must retain the historical module.runners address."
  }

  assert {
    condition     = keys(aws_sqs_queue.queued_builds) == ["linux"]
    error_message = "Common queue ownership must preserve the stable lane key."
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
    multi_runner_config_v2 = {
      linux = {
        runner = {
          runner_os                   = "linux"
          runner_architecture         = "x64"
          runners_maximum_count       = 2
          enable_organization_runners = true
          idle_config = [{
            cron      = "* * * * *"
            timeZone  = "UTC"
            idleCount = 1
          }]
          pool_config = [{
            schedule_expression = "cron(0 8 * * ? *)"
            size                = 1
          }]
          iam = {
            managed_policy_arns = {
              readonly = "arn:aws:iam::aws:policy/ReadOnlyAccess"
            }
          }
        }
        provider = {
          type = "ec2"
          ec2 = {
            instance_types                = ["m5.large"]
            enable_runner_binaries_syncer = false
          }
        }
        matcherConfig = {
          labelMatchers = [["self-hosted", "linux", "x64"]]
        }
      }
    }
  }

  assert {
    condition     = keys(local.runner_config_by_provider.ec2) == ["linux"]
    error_message = "Experimental multi_runner_config_v2 lanes must route to the EC2 provider."
  }

  assert {
    condition     = length(local.runner_config_v1) == 0 && keys(local.runner_config_v2) == ["linux"]
    error_message = "Experimental multi_runner_config_v2 lanes must remain isolated in the v2 lane map."
  }

  assert {
    condition     = length(module.runners) == 0 && keys(module.runner_stacks) == ["linux"]
    error_message = "Experimental multi_runner_config_v2 lanes must dispatch through module.runner_stacks."
  }

  assert {
    condition     = keys(aws_sqs_queue.queued_builds) == ["linux"]
    error_message = "Common queue ownership must preserve the experimental lane key."
  }

  assert {
    condition     = keys(output.runners_map) == ["linux"]
    error_message = "Experimental multi_runner_config_v2 must preserve the public runner map key."
  }

  assert {
    condition = toset(keys(output.runners_map["linux"])) == toset(
      [
        "provider",
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
      ]
    )
    error_message = "Experimental v2 runners_map entries must expose provider resources only through the nested provider object."
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
    error_message = "Experimental v2 must expose only EC2-owned resources under runners_map.<lane>.provider.ec2."
  }

  assert {
    condition = (
      !contains(keys(output.runners_map["linux"]), "launch_template_name")
      && contains(keys(output.runners_map["linux"]), "role_runner")
      && !contains(keys(output.runners_map["linux"].provider.ec2), "role_runner")
      && !contains(keys(output.runners_map["linux"]), "runners_log_groups")
      && !contains(keys(output.runners_map["linux"]), "logfiles")
    )
    error_message = "Experimental v2 must expose the common runner role at lane level without duplicating EC2 resources."
  }

  assert {
    condition     = local.runner_config_by_provider.ec2["linux"].runner.idle_config[0].idleCount == 1
    error_message = "Provider-neutral idle configuration must remain in the common runner contract."
  }

  assert {
    condition     = local.runner_config_by_provider.ec2["linux"].runner.iam.managed_policy_arns.readonly == "arn:aws:iam::aws:policy/ReadOnlyAccess"
    error_message = "Runner-role policies must remain in the common runner contract."
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

    multi_runner_config_v2 = {
      experimental = {
        runner = {
          runner_os                   = "linux"
          runner_architecture         = "arm64"
          runners_maximum_count       = 2
          enable_organization_runners = true
        }
        provider = {
          type = "ec2"
          ec2 = {
            instance_types                = ["m7g.large"]
            enable_runner_binaries_syncer = true
          }
        }
        matcherConfig = {
          labelMatchers = [["self-hosted", "linux", "arm64", "experimental"]]
        }
      }
    }
  }

  assert {
    condition     = keys(local.runner_config_v1) == ["legacy"] && keys(local.runner_config_v2) == ["experimental"]
    error_message = "Stable and experimental lanes must remain isolated in their respective lane maps."
  }

  assert {
    condition     = keys(module.runners) == ["legacy"] && keys(module.runner_stacks) == ["experimental"]
    error_message = "Stable lanes must keep module.runners addresses while v2 lanes use module.runner_stacks."
  }

  assert {
    condition = (
      toset(keys(aws_sqs_queue.queued_builds)) == toset(["legacy", "experimental"])
      && toset(keys(local.runner_matcher_config)) == toset(["legacy", "experimental"])
    )
    error_message = "Queues and webhook routing must use the union of stable and experimental lane keys."
  }

  assert {
    condition     = toset(keys(module.runner_binaries)) == toset(["linux_x64", "linux_arm64"])
    error_message = "Runner binary synchronization must include operating-system and architecture combinations from both input versions."
  }

  assert {
    condition     = toset(keys(output.runners_map)) == toset(["legacy", "experimental"])
    error_message = "The public runner map must expose both stable and experimental lane keys."
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
    error_message = "A coexisting stable lane must retain the legacy flat runners_map entry shape."
  }

  assert {
    condition     = output.runners_map["experimental"].provider.type == "ec2" && contains(keys(output.runners_map["experimental"].provider.ec2), "launch_template")
    error_message = "A coexisting v2 lane must retain its nested EC2 provider output."
  }
}

run "duplicate_lane_keys_are_rejected" {
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

    multi_runner_config_v2 = {
      duplicate = {
        runner = {
          runner_os             = "linux"
          runner_architecture   = "x64"
          runners_maximum_count = 2
        }
        provider = {
          type = "ec2"
          ec2 = {
            instance_types                = ["m5.large"]
            enable_runner_binaries_syncer = false
          }
        }
        matcherConfig = {
          labelMatchers = [["self-hosted", "linux", "x64", "experimental"]]
        }
      }
    }
  }

  expect_failures = [random_string.random]
}

run "experimental_v2_rejects_future_providers" {
  command = plan

  variables {
    multi_runner_config_v2 = {
      microvm = {
        runner = {
          runner_os             = "linux"
          runner_architecture   = "x64"
          runners_maximum_count = 2
        }
        provider = {
          type = "microvm"
        }
        matcherConfig = {
          labelMatchers = [["self-hosted", "linux", "x64"]]
        }
      }
    }
  }

  expect_failures = [var.multi_runner_config_v2]
}

run "experimental_v2_rejects_profile_without_role" {
  command = plan

  variables {
    multi_runner_config_v2 = {
      invalid_profile = {
        runner = {
          runner_os             = "linux"
          runner_architecture   = "x64"
          runners_maximum_count = 2
        }
        provider = {
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

  expect_failures = [var.multi_runner_config_v2]
}
