mock_provider "aws" {
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
        }
        provider = {
          type = "ec2"
          ec2 = {
            instance_types                      = ["m5.large"]
            enable_runner_binaries_syncer       = false
            runner_iam_role_managed_policy_arns = ["arn:aws:iam::aws:policy/ReadOnlyAccess"]
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
      && can(output.runners_map["linux"].provider.ec2.launch_template)
      && can(output.runners_map["linux"].provider.ec2.role_runner)
      && can(output.runners_map["linux"].provider.ec2.runners_log_groups)
      && can(output.runners_map["linux"].provider.ec2.logfiles)
    )
    error_message = "Experimental v2 EC2 resources must be available under runners_map.<lane>.provider.ec2."
  }

  assert {
    condition = (
      !can(output.runners_map["linux"].launch_template_name)
      && !can(output.runners_map["linux"].role_runner)
      && !can(output.runners_map["linux"].runners_log_groups)
      && !can(output.runners_map["linux"].logfiles)
    )
    error_message = "Experimental v2 entries must not duplicate provider resources as flat output attributes."
  }

  assert {
    condition     = local.runner_config_by_provider.ec2["linux"].runner.idle_config[0].idleCount == 1
    error_message = "Provider-neutral idle configuration must remain in the common runner contract."
  }

  assert {
    condition     = local.runner_config_by_provider.ec2["linux"].provider.ec2.runner_iam_role_managed_policy_arns[0] == "arn:aws:iam::aws:policy/ReadOnlyAccess"
    error_message = "EC2 runner-role policies must remain in the EC2 provider contract."
  }
}

run "experimental_v2_takes_precedence_without_legacy_addresses" {
  command = plan

  variables {
    multi_runner_config = {
      legacy = {
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

    multi_runner_config_v2 = {
      experimental = {
        runner = {
          runner_os                   = "linux"
          runner_architecture         = "x64"
          runners_maximum_count       = 2
          enable_organization_runners = true
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

  assert {
    condition     = length(module.runners) == 0 && keys(module.runner_stacks) == ["experimental"]
    error_message = "Setting multi_runner_config_v2 must not instantiate any stable v1 runner modules."
  }

  assert {
    condition     = keys(aws_sqs_queue.queued_builds) == ["experimental"] && keys(local.runner_matcher_config) == ["experimental"]
    error_message = "Queues and webhook routing must use only the selected v2 lane keys."
  }

  assert {
    condition     = keys(output.runners_map) == ["experimental"]
    error_message = "The merged public runner map must expose only the selected v2 lane keys."
  }

  assert {
    condition     = output.runners_map["experimental"].provider.type == "ec2" && can(output.runners_map["experimental"].provider.ec2.launch_template)
    error_message = "The selected v2 lane must retain its nested EC2 provider output."
  }
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
