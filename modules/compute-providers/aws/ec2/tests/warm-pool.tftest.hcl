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
