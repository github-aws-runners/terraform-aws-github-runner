mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{}"
    }
  }
}

override_data {
  target = data.aws_iam_policy_document.assume_role
  values = {
    json = "{\"Principal\":{\"Service\":\"ec2.amazonaws.com\"}}"
  }
}

variables {
  aws_region = "eu-west-1"

  config = {
    cloudwatch_agent = {
      enabled = true
    }
    binaries_syncer = {
      enabled = true
      s3 = {
        arn = "arn:aws:s3:::runner-distribution"
        key = "runner.zip"
      }
    }
    ssm_enabled = true
  }

  ssm = {
    paths = {
      root   = "/github-runner/provider-test"
      tokens = "tokens"
      config = "config"
    }
  }
}

run "exports_provider_owned_runner_role_contract" {
  command = plan

  assert {
    condition     = strcontains(output.assume_role_policy_json, "ec2.amazonaws.com")
    error_message = "The EC2 runner-role contract must expose its trust policy."
  }

  assert {
    condition = toset(keys(output.inline_policies)) == toset([
      "ssm_parameters",
      "describe_tags",
      "create_tags",
      "terminate_self",
      "session_manager",
      "distribution_bucket",
      "cloudwatch",
    ])
    error_message = "The EC2 runner-role contract must expose stable keys for all enabled policies."
  }

  assert {
    condition     = output.inline_policies.create_tags.name == "runner-create-tags"
    error_message = "Policy names must be separate from stable contract keys."
  }

  assert {
    condition     = length(output.managed_policy_arns) == 0
    error_message = "The EC2 role contract must not include common or user-managed policy attachments."
  }
}

run "omits_disabled_optional_policies" {
  command = plan

  variables {
    config = {
      cloudwatch_agent = {
        enabled = false
      }
      binaries_syncer = {
        enabled = false
      }
      ssm_enabled = false
    }
  }

  assert {
    condition     = toset(keys(output.inline_policies)) == toset(["ssm_parameters", "describe_tags", "create_tags", "terminate_self"])
    error_message = "Disabled optional EC2 policies must be omitted without changing the stable base keys."
  }
}

run "requires_distribution_object_when_sync_is_enabled" {
  command = plan

  variables {
    config = {
      binaries_syncer = {
        enabled = true
        s3      = null
      }
    }
  }

  expect_failures = [var.config]
}
