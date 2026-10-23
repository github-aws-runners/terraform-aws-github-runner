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

  storage_provider = {
    aws = {
      ssm = {
        paths = {
          root   = "/github-runner/provider-test"
          tokens = "tokens"
          config = "config"
        }
      }
    }
  }
}

run "warm_pool_disabled_by_default" {
  command = plan

  assert {
    condition = (
      length(aws_dynamodb_table.warm_pool_index) == 0
      && !contains(keys(local.provider_environment_variables.scale_up), "WARM_POOL_ENABLED")
      && !contains(keys(local.provider_environment_variables.pool), "WARM_POOL_INDEX_TABLE_NAME")
    )
    error_message = "No index table or warm env vars without warm_pool."
  }
}

run "warm_pool_enabled" {
  command = plan

  variables {
    warm_pool = { enabled = true }
  }

  assert {
    condition = (
      length(aws_dynamodb_table.warm_pool_index) == 1
      && aws_dynamodb_table.warm_pool_index[0].name == "provider-test-warm-pool-index"
      && aws_dynamodb_table.warm_pool_index[0].hash_key == "environment"
      && aws_dynamodb_table.warm_pool_index[0].range_key == "instanceId"
      && local.provider_environment_variables.scale_up["WARM_POOL_ENABLED"] == "true"
      && local.provider_environment_variables.scale_up["WARM_POOL_INDEX_TABLE_NAME"] == "provider-test-warm-pool-index"
      && local.provider_environment_variables.pool["WARM_POOL_INDEX_TABLE_NAME"] == "provider-test-warm-pool-index"
      && length(data.aws_iam_policy_document.pool_warm) == 1
      && length(data.aws_iam_policy_document.scale_up_warm) == 1
    )
    error_message = "Warm pool must create the index table, warm env vars, and pool/scale-up policies."
  }
}

run "warm_pool_windows" {
  command = plan

  variables {
    warm_pool = { enabled = true }
    runner    = merge(var.runner, { os = "windows" })
  }

  assert {
    condition     = length(aws_dynamodb_table.warm_pool_index) == 1
    error_message = "Warm pool should plan for windows runners"
  }
}

run "warm_pool_rejects_osx" {
  command = plan

  variables {
    warm_pool = { enabled = true }
    runner    = merge(var.runner, { os = "osx" })
  }

  expect_failures = [terraform_data.validate_runner]
}

run "warm_pool_requires_metadata_tags" {
  command = plan

  variables {
    warm_pool = { enabled = true }
    config = merge(var.config, {
      metadata_options = {
        instance_metadata_tags      = "disabled"
        http_endpoint               = "enabled"
        http_tokens                 = "required"
        http_put_response_hop_limit = 1
      }
    })
  }

  expect_failures = [terraform_data.validate_runner]
}

run "warm_pool_spot_placement_permissions" {
  command = plan

  variables {
    warm_pool = { enabled = true }
  }

  assert {
    condition     = contains([for statement in data.aws_iam_policy_document.pool_warm[0].statement : statement.sid], "WarmPoolSpotPlacement")
    error_message = "A spot warm pool needs the spot placement permissions."
  }
}

run "warm_pool_on_demand_without_spot_placement" {
  command = plan

  variables {
    warm_pool = { enabled = true }
    config    = merge(var.config, { instance_target_capacity_type = "on-demand" })
  }

  assert {
    condition = !contains(
      [for statement in data.aws_iam_policy_document.pool_warm[0].statement : statement.sid],
      "WarmPoolSpotPlacement",
    )
    error_message = "An on-demand warm pool must not get the spot placement permissions."
  }
}

run "spot_warm_pool_runner_cancels_only_its_own_request" {
  command = plan

  variables {
    warm_pool = { enabled = true }
  }

  assert {
    condition     = contains(keys(output.provider.policies.runner.inline_policies), "cancel_own_spot_request")
    error_message = "The runner of a spot warm pool must be able to cancel its own spot request."
  }

  assert {
    condition = (
      data.aws_iam_policy_document.cancel_own_spot_request[0].statement[0].actions == toset(["ec2:CancelSpotInstanceRequests"])
      && data.aws_iam_policy_document.cancel_own_spot_request[0].statement[0].resources == toset(["arn:*:ec2:*:*:spot-instances-request/*"])
      && one(data.aws_iam_policy_document.cancel_own_spot_request[0].statement[0].condition).variable == "aws:ResourceTag/ghr:instance-arn"
      && one(data.aws_iam_policy_document.cancel_own_spot_request[0].statement[0].condition).values == tolist(["&{ec2:SourceInstanceARN}"])
    )
    error_message = "The runner may cancel only the spot request tagged with its own instance ARN."
  }

  assert {
    condition = (
      data.aws_iam_policy_document.create_tags.statement[0].resources == toset(["arn:*:ec2:*:*:instance/*"])
      && !anytrue([
        for statement in flatten([
          data.aws_iam_policy_document.describe_tags.statement,
          data.aws_iam_policy_document.create_tags.statement,
          data.aws_iam_policy_document.terminate_self.statement,
          data.aws_iam_policy_document.cancel_own_spot_request[0].statement,
        ]) : contains(statement.actions, "ec2:DescribeSpotInstanceRequests")
      ])
    )
    error_message = "The runner must not tag spot requests or read spot requests."
  }
}

run "on_demand_warm_pool_runner_cannot_cancel_spot_requests" {
  command = plan

  variables {
    warm_pool = { enabled = true }
    config    = merge(var.config, { instance_target_capacity_type = "on-demand" })
  }

  assert {
    condition     = !contains(keys(output.provider.policies.runner.inline_policies), "cancel_own_spot_request")
    error_message = "An on-demand warm pool runner needs no spot request permission."
  }
}

run "spot_runner_without_warm_pool_cannot_cancel_spot_requests" {
  command = plan

  assert {
    condition     = !contains(keys(output.provider.policies.runner.inline_policies), "cancel_own_spot_request")
    error_message = "Only warm pool runners get the spot request permission."
  }
}
