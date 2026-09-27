mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  mock_data "aws_partition" {
    defaults = {
      partition = "aws"
    }
  }

  mock_data "aws_region" {
    defaults = {
      region = "eu-west-1"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/computed-test"
    }
  }
}

run "plans_with_computed_values_inside_known_wrappers" {
  command = plan

  module {
    source = "./tests/fixtures/computed-inputs"
  }

  assert {
    condition = (
      toset(keys(output.controller_groups)) == toset(["ec2"]) &&
      toset(output.controller_groups.ec2.runner_configs) == toset(["computed"]) &&
      !output.cluster.managed &&
      toset(keys(output.reconciler_config_parameters)) == toset(["ec2/computed"])
    )
    error_message = "Computed inner values and explicit nulls must not affect group, ownership, IAM-wrapper, or cluster resource shape."
  }
}
