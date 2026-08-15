mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{}"
    }
  }

  mock_data "aws_ami" {
    defaults = {
      id               = "ami-1234567890abcdef0"
      name             = "runner-test"
      creation_date    = "2026-01-01T00:00:00.000Z"
      deprecation_time = ""
    }
  }

  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }
}

override_data {
  target = data.aws_iam_policy_document.scale_up
  values = {
    json = "{\"Action\":\"ec2:RunInstances\",\"PassRole\":\"arn:aws:iam::123456789012:role/provider-test-runner\"}"
  }
}

override_data {
  target = data.aws_iam_policy_document.pool
  values = {
    json = "{\"Action\":\"iam:PassRole\"}"
  }
}

variables {
  aws_region = "eu-west-1"
  prefix     = "provider-test"

  config = {
    vpc_id         = "vpc-12345678"
    subnet_ids     = ["subnet-12345678"]
    instance_types = ["m5.large"]
    ami = {
      filter = { state = ["available"] }
      owners = ["amazon"]
      id_ssm_parameter = {
        arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/ami-id"
      }
      kms_key = null
    }
    binaries_syncer = {
      enabled = true
      s3 = {
        arn = "arn:aws:s3:::runner-distribution"
        id  = "runner-distribution"
        key = "runner.zip"
      }
    }
    cloudwatch_agent = {
      enabled = true
    }
    ssm_enabled                    = true
    managed_security_group_enabled = true
  }

  runner = {
    iam = {
      role = {
        arn  = "arn:aws:iam::123456789012:role/provider-test-runner"
        name = "provider-test-runner"
      }
      managed_policy_arns = {
        readonly = "arn:aws:iam::aws:policy/ReadOnlyAccess"
      }
    }
  }

  ssm = {
    paths = {
      root   = "/github-runner/provider-test"
      tokens = "tokens"
      config = "config"
    }
  }
}

run "separates_control_plane_contract_from_ec2_resources" {
  command = plan

  assert {
    condition     = toset(keys(output.provider)) == toset(["environment_variables", "policies", "resources"])
    error_message = "The EC2 provider contract must expose only integration and resource data; its module identity must not be repeated in the output."
  }

  assert {
    condition     = output.provider.environment_variables.scale_up["INSTANCE_TYPES"] == "m5.large"
    error_message = "The provider contract must expose EC2 scale-up environment variables."
  }

  assert {
    condition     = output.provider.environment_variables.scale_down["RUNNER_BOOT_TIME_IN_MINUTES"] == 5
    error_message = "The provider contract must expose the EC2 scale-down boot grace period."
  }

  assert {
    condition     = strcontains(output.provider.policies.scale_up.iam_policy_json, "ec2:RunInstances")
    error_message = "The EC2 provider must own EC2 scale-up permissions."
  }

  assert {
    condition     = !strcontains(output.provider.policies.scale_up.iam_policy_json, "sqs:ReceiveMessage")
    error_message = "The EC2 provider must not own common build-queue permissions."
  }

  assert {
    condition     = strcontains(output.provider.policies.pool.iam_policy_json, "iam:PassRole")
    error_message = "The EC2 provider must expose pool permissions for its runner role."
  }

  assert {
    condition     = strcontains(output.provider.policies.scale_up.iam_policy_json, "arn:aws:iam::123456789012:role/provider-test-runner")
    error_message = "The EC2 provider must use the common runner role ARN for PassRole."
  }

  assert {
    condition     = output.provider.policies.scale_up.managed_policy_enabled
    error_message = "An external AMI SSM parameter must enable the scale-up managed policy attachment at plan time."
  }

  assert {
    condition     = output.provider.policies.pool.managed_policy_enabled
    error_message = "An external AMI SSM parameter must enable the pool managed policy attachment at plan time."
  }

  assert {
    condition = (
      contains(flatten([
        for statement in data.aws_iam_policy_document.scale_up.statement : [
          for condition in statement.condition : condition.variable
        ]
      ]), "ec2:ResourceTag/ghr:environment")
      && contains(flatten([
        for statement in data.aws_iam_policy_document.scale_down.statement : [
          for condition in statement.condition : condition.variable
        ]
      ]), "ec2:ResourceTag/ghr:environment")
      && !contains(flatten([
        for statement in data.aws_iam_policy_document.scale_up.statement : [
          for condition in statement.condition : condition.variable
        ]
      ]), "ec2:ResourceTag/gh:environment")
      && !contains(flatten([
        for statement in data.aws_iam_policy_document.scale_down.statement : [
          for condition in statement.condition : condition.variable
        ]
      ]), "ec2:ResourceTag/gh:environment")
    )
    error_message = "EC2 scale policies must authorize resources by the protected ghr:environment tag."
  }

  assert {
    condition     = toset(keys(output.provider.policies)) == toset(["runner", "scale_up", "scale_down", "pool", "scale_set"])
    error_message = "The EC2 provider must expose policies grouped by their owning common component."
  }

  assert {
    condition = toset(keys(output.provider.policies.runner.inline_policies)) == toset([
      "ssm_parameters",
      "describe_tags",
      "create_tags",
      "terminate_self",
      "session_manager",
      "distribution_bucket",
      "cloudwatch",
    ])
    error_message = "The EC2 provider must return the enabled runner permission documents."
  }

  assert {
    condition     = output.provider.policies.runner.managed_policy_arns["readonly"] == "arn:aws:iam::aws:policy/ReadOnlyAccess"
    error_message = "The EC2 provider must return common managed runner policy inputs with its provider policies."
  }

  assert {
    condition     = toset(keys(output.provider.resources)) == toset(["launch_template", "runners_log_groups", "logfiles"])
    error_message = "EC2-specific artifacts must remain nested under provider resources."
  }

  assert {
    condition     = aws_iam_instance_profile.runner[0].role == "provider-test-runner"
    error_message = "The EC2 instance profile must use the common runner role name."
  }

  assert {
    condition = (
      strcontains(local.user_data, "scale_set_enabled=\"false\"") &&
      !strcontains(local.user_data, "ghr:created_by tag") &&
      strcontains(local.user_data, "if [[ \"$scale_set_enabled\" == \"true\" ]]")
    )
    error_message = "Classic Linux bootstrap must render scale-set mode off and must not infer its controller from the ghr:created_by tag."
  }

}

run "exports_scoped_scale_set_listener_contract" {
  command = plan

  override_data {
    target = data.aws_iam_policy_document.scale_set[0]
    values = {
      json = "{\"Action\":\"ec2:CreateFleet\"}"
    }
  }

  variables {
    scale_set = {
      id = 123
    }
  }

  assert {
    condition = (
      output.provider.environment_variables.scale_set["COMPUTE_PROVIDER_TYPE"] == "ec2" &&
      output.provider.environment_variables.scale_set["ENVIRONMENT"] == "provider-test" &&
      output.provider.environment_variables.scale_set["INSTANCE_TYPES"] == "m5.large" &&
      output.provider.environment_variables.scale_set["RUNNER_BOOT_TIME_IN_MINUTES"] == "5" &&
      !contains(keys(output.provider.environment_variables.scale_set), "INSTANCE_TYPE_PRIORITIES")
    )
    error_message = "The scale-set listener must receive the complete EC2 environment without empty optional JSON values."
  }

  assert {
    condition     = length(data.aws_iam_policy_document.scale_set) == 1
    error_message = "A configured scale set must enable its dedicated EC2 provider policy."
  }

  assert {
    condition = alltrue([
      for statement in data.aws_iam_policy_document.scale_set[0].statement :
      alltrue([
        for required_condition in [
          "ec2:ResourceTag/ghr:Application",
          "ec2:ResourceTag/ghr:created_by",
          "ec2:ResourceTag/ghr:environment",
          "ec2:ResourceTag/ghr:scale_set_id",
        ] : contains([for condition in statement.condition : condition.variable], required_condition)
      ])
      if contains(["TerminateOwnedRunners", "UpdateOwnedRunnerLifecycle"], statement.sid)
    ])
    error_message = "Every destructive scale-set lifecycle statement must combine all ownership conditions with AND semantics."
  }

  assert {
    condition = contains(
      one([
        for condition in one([
          for statement in data.aws_iam_policy_document.scale_set[0].statement : statement
          if statement.sid == "UpdateOwnedRunnerLifecycle"
        ]).condition : condition.values
        if condition.variable == "aws:TagKeys"
      ]),
      "ghr:scale_set_state",
    )
    error_message = "The listener may update the scale-set lifecycle state only through the restricted lifecycle tag grant."
  }

  assert {
    condition = (
      contains(
        one([
          for condition in data.aws_iam_policy_document.create_tags.statement[0].condition : condition.values
          if condition.variable == "aws:TagKeys"
        ]),
        "ghr:scale_set_state",
      ) &&
      !contains(
        one([
          for condition in data.aws_iam_policy_document.create_tags.statement[0].condition : condition.values
          if condition.variable == "aws:TagKeys"
        ]),
        "ghr:github_runner_id",
      )
    )
    error_message = "Scale-set bootstrap may self-tag lifecycle state but must not mutate controller-owned GitHub runner identity."
  }

  assert {
    condition = (
      strcontains(local.user_data, "scale_set_enabled=\"true\"") &&
      !strcontains(local.user_data, "ghr:created_by tag") &&
      strcontains(local.user_data, "if [[ \"$scale_set_enabled\" == \"true\" ]]")
    )
    error_message = "Scale-set Linux bootstrap must render scale-set mode on and use it as the authoritative lifecycle fence."
  }
}

run "renders_static_scale_set_mode_for_macos" {
  command = plan

  variables {
    scale_set = {
      id = 123
    }
    runner = {
      os           = "osx"
      architecture = "x64"
      iam = {
        role = {
          arn  = "arn:aws:iam::123456789012:role/provider-test-runner"
          name = "provider-test-runner"
        }
      }
    }
  }

  assert {
    condition = (
      strcontains(local.user_data, "scale_set_enabled=\"true\"") &&
      !strcontains(local.user_data, "ghr:created_by tag") &&
      strcontains(local.user_data, "if [[ \"$scale_set_enabled\" == \"true\" ]]")
    )
    error_message = "Scale-set macOS bootstrap must render scale-set mode on and use it as the authoritative lifecycle fence."
  }
}

run "renders_static_classic_mode_for_windows" {
  command = plan

  variables {
    runner = {
      os           = "windows"
      architecture = "x64"
      iam = {
        role = {
          arn  = "arn:aws:iam::123456789012:role/provider-test-runner"
          name = "provider-test-runner"
        }
      }
    }
  }

  assert {
    condition = (
      strcontains(local.user_data, "$scaleSetEnabled = \"false\" -eq \"true\"") &&
      !strcontains(local.user_data, "ghr:created_by tag") &&
      strcontains(local.user_data, "if ($scaleSetEnabled)")
    )
    error_message = "Classic Windows bootstrap must render scale-set mode off and must not infer its controller from the ghr:created_by tag."
  }
}

run "accepts_partial_typed_compute_options" {
  command = plan

  variables {
    config = {
      vpc_id         = "vpc-12345678"
      subnet_ids     = ["subnet-12345678"]
      instance_types = ["m5.large"]
      ami = {
        filter = { state = ["available"] }
        owners = ["amazon"]
        id_ssm_parameter = {
          arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/ami-id"
        }
        kms_key = null
      }
      binaries_syncer = {
        enabled = false
        s3      = null
      }
      cloudwatch_agent = {
        enabled = false
      }
      managed_security_group_enabled = true
      overrides = {
        name_runner = "custom-runner"
      }
      metadata_options = {
        http_tokens = "optional"
      }
    }
  }

  assert {
    condition     = local.name_runner == "custom-runner" && local.name_sg == "provider-test-action-runner"
    error_message = "Partial name overrides must retain defaults for omitted attributes."
  }

  assert {
    condition = (
      aws_launch_template.runner.metadata_options[0].http_tokens == "optional"
      && aws_launch_template.runner.metadata_options[0].http_endpoint == "enabled"
      && aws_launch_template.runner.metadata_options[0].http_put_response_hop_limit == 1
      && aws_launch_template.runner.metadata_options[0].instance_metadata_tags == "enabled"
    )
    error_message = "Partial metadata options must retain typed defaults for omitted attributes."
  }

  assert {
    condition = toset(keys(output.provider.policies.runner.inline_policies)) == toset([
      "ssm_parameters",
      "describe_tags",
      "create_tags",
      "terminate_self",
    ])
    error_message = "Disabled optional EC2 features must remove only their corresponding runner policies."
  }
}

run "separates_provider_runner_and_ssm_tags" {
  command = plan

  variables {
    config = {
      vpc_id         = "vpc-12345678"
      subnet_ids     = ["subnet-12345678"]
      instance_types = ["m5.large"]
      ami = {
        filter           = { state = ["available"] }
        owners           = ["amazon"]
        id_ssm_parameter = null
        kms_key          = null
      }
      binaries_syncer = {
        enabled = false
        s3      = null
      }
      cloudwatch_agent = {
        enabled = true
      }
      managed_security_group_enabled = true
      tags = {
        Name                     = "runner-name"
        Scope                    = "runner"
        RunnerOnly               = "runner"
        "ghr:environment"        = "runner-override"
        "ghr:ssm_config_path"    = "/runner/override"
        "ghr:runner_name_prefix" = "runner-override"
      }
    }
    tags = {
      Name  = "provider-name"
      Scope = "provider"
    }
    runner = {
      name_prefix = "required-prefix"
      iam = {
        role = {
          arn  = "arn:aws:iam::123456789012:role/provider-test-runner"
          name = "provider-test-runner"
        }
      }
    }
    ssm = {
      paths = {
        root   = "/github-runner/provider-test"
        tokens = "tokens"
        config = "config"
      }
      parameters = {
        tags = {
          Name                       = "ssm-name"
          Scope                      = "ssm"
          SsmOnly                    = "ssm"
          "ghr:ami_name"             = "ssm-override"
          "ghr:ami_creation_date"    = "ssm-override"
          "ghr:ami_deprecation_time" = "ssm-override"
        }
      }
    }
    observability = {
      logs = {
        tags = {
          Name    = "log-name"
          Scope   = "log"
          LogOnly = "log"
        }
      }
    }
  }

  assert {
    condition = (
      aws_launch_template.runner.tags["Name"] == "provider-name"
      && aws_launch_template.runner.tags["Scope"] == "provider"
      && !contains(keys(aws_launch_template.runner.tags), "RunnerOnly")
      && !contains(keys(aws_launch_template.runner.tags), "SsmOnly")
      && !contains(keys(aws_launch_template.runner.tags), "ghr:environment")
      && !contains(keys(aws_launch_template.runner.tags), "ghr:ssm_config_path")
      && !contains(keys(aws_launch_template.runner.tags), "ghr:runner_name_prefix")
    )
    error_message = "Non-runner EC2 resources must use provider tags without runner or SSM component tags."
  }

  assert {
    condition = toset([
      for tag_specification in aws_launch_template.runner.tag_specifications : tag_specification.resource_type
    ]) == toset(["instance", "volume", "network-interface", "spot-instances-request"])
    error_message = "The launch template must define runner tags for every supported runner resource type."
  }

  assert {
    condition = alltrue([
      for tag_specification in aws_launch_template.runner.tag_specifications : (
        tag_specification.tags["Name"] == "runner-name"
        && tag_specification.tags["Scope"] == "runner"
        && tag_specification.tags["RunnerOnly"] == "runner"
        && !contains(keys(tag_specification.tags), "SsmOnly")
        && tag_specification.tags["ghr:environment"] == "provider-test"
        && tag_specification.tags["ghr:ssm_config_path"] == "/github-runner/provider-test/config"
        && tag_specification.tags["ghr:runner_name_prefix"] == "required-prefix"
      )
    ])
    error_message = "Runner resource tags must apply runner overrides while protecting mandatory bootstrap tags."
  }

  assert {
    condition = (
      aws_ssm_parameter.runner_config_run_as.tags["Name"] == "ssm-name"
      && aws_ssm_parameter.runner_config_run_as.tags["Scope"] == "ssm"
      && aws_ssm_parameter.runner_config_run_as.tags["SsmOnly"] == "ssm"
      && !contains(keys(aws_ssm_parameter.runner_config_run_as.tags), "RunnerOnly")
      && !contains(keys(aws_ssm_parameter.runner_config_run_as.tags), "ghr:environment")
    )
    error_message = "EC2 SSM parameters must merge SSM component tags over provider tags."
  }

  assert {
    condition = alltrue([
      for log_group in aws_cloudwatch_log_group.gh_runners : (
        log_group.tags["Name"] == "log-name"
        && log_group.tags["Scope"] == "log"
        && log_group.tags["LogOnly"] == "log"
        && !contains(keys(log_group.tags), "RunnerOnly")
        && !contains(keys(log_group.tags), "SsmOnly")
      )
    ])
    error_message = "EC2 log groups must merge shared log tags over provider tags without runner or SSM tags."
  }

  assert {
    condition = (
      aws_ssm_parameter.runner_ami_id[0].tags["Name"] == "ssm-name"
      && aws_ssm_parameter.runner_ami_id[0].tags["Scope"] == "ssm"
      && aws_ssm_parameter.runner_ami_id[0].tags["SsmOnly"] == "ssm"
      && aws_ssm_parameter.runner_ami_id[0].tags["ghr:ami_name"] == "runner-test"
      && aws_ssm_parameter.runner_ami_id[0].tags["ghr:ami_creation_date"] == "2026-01-01T00:00:00.000Z"
      && aws_ssm_parameter.runner_ami_id[0].tags["ghr:ami_deprecation_time"] == ""
    )
    error_message = "The managed AMI parameter must preserve authoritative AMI metadata over SSM component tags."
  }
}

run "rejects_external_instance_profile_with_managed_role" {
  command = plan

  variables {
    config = {
      vpc_id         = "vpc-12345678"
      subnet_ids     = ["subnet-12345678"]
      instance_types = ["m5.large"]
      instance_profile = {
        name = "external-runner-profile"
      }
      binaries_syncer = {
        enabled = false
      }
    }

    runner = {
      iam = {
        role = {
          arn     = "arn:aws:iam::123456789012:role/provider-test-runner"
          name    = "provider-test-runner"
          managed = true
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_config]
}

run "requires_distribution_object_when_sync_is_enabled" {
  command = plan

  variables {
    config = {
      vpc_id         = "vpc-12345678"
      subnet_ids     = ["subnet-12345678"]
      instance_types = ["m5.large"]
      binaries_syncer = {
        enabled = true
        s3      = null
      }
    }
  }

  expect_failures = [terraform_data.validate_config]
}
