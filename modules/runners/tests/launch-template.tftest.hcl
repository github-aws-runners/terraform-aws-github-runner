mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/test-role"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:eu-west-1:123456789012:function:test"
    }
  }

  mock_resource "aws_cloudwatch_event_rule" {
    defaults = {
      arn = "arn:aws:events:eu-west-1:123456789012:rule/test"
    }
  }
}

variables {
  aws_region = "eu-west-1"
  vpc_id     = "vpc-12345678"
  subnet_ids = ["subnet-12345678"]

  instance_types = ["m5.large"]

  s3_runner_binaries = {
    arn = "arn:aws:s3:::my-bucket"
    id  = "my-bucket"
    key = "runners/linux/actions-runner.tar.gz"
  }

  sqs_build_queue = {
    arn = "arn:aws:sqs:eu-west-1:123456789012:build-queue"
    url = "https://sqs.eu-west-1.amazonaws.com/123456789012/build-queue"
  }

  enable_organization_runners = true
  enable_ssm_on_runners       = true
  runner_labels               = ["self-hosted", "linux", "x64"]

  lambda_s3_bucket      = "my-lambda-bucket"
  runners_lambda_s3_key = "runners.zip"

  github_app_parameters = {
    key_base64 = { name = "/github-runner/key-base64", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64" }
    id         = { name = "/github-runner/app-id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id" }
  }

  ssm_paths = {
    root   = "/github-runner"
    tokens = "tokens"
    config = "config"
  }
}

run "omits_on_demand_override_launch_template_by_default" {
  command = plan

  assert {
    condition     = toset(keys(aws_launch_template.runner)) == toset(["default"])
    error_message = "Only a single launch template must exist when instance_capacity_type_override_enabled is not set."
  }

  assert {
    condition     = aws_lambda_function.scale_up.environment[0].variables["ON_DEMAND_OVERRIDE_LAUNCH_TEMPLATE_NAME"] == ""
    error_message = "The scale-up Lambda must not get an on-demand-override launch template name when the feature is disabled."
  }
}

run "creates_on_demand_override_launch_template_when_capacity_type_override_enabled" {
  command = plan

  variables {
    instance_target_capacity_type           = "spot"
    instance_capacity_type_override_enabled = true
  }

  assert {
    condition     = toset(keys(aws_launch_template.runner)) == toset(["default", "on_demand_override"])
    error_message = "Enabling instance_capacity_type_override_enabled must create both launch template variants."
  }

  assert {
    condition = toset([
      for tag_specification in aws_launch_template.runner["default"].tag_specifications : tag_specification.resource_type
    ]) == toset(["instance", "volume", "network-interface", "spot-instances-request"])
    error_message = "The default variant must keep tagging the spot-instances-request resource when the default capacity type is spot."
  }

  assert {
    condition = toset([
      for tag_specification in aws_launch_template.runner["on_demand_override"].tag_specifications : tag_specification.resource_type
    ]) == toset(["instance", "volume", "network-interface"])
    error_message = "The on-demand-override variant must never tag the spot-instances-request resource."
  }

  assert {
    condition     = aws_lambda_function.scale_up.environment[0].variables["ON_DEMAND_OVERRIDE_LAUNCH_TEMPLATE_NAME"] == aws_launch_template.runner["on_demand_override"].name
    error_message = "The scale-up Lambda must get the on-demand-override launch template name when the feature is enabled."
  }
}

run "creates_on_demand_override_launch_template_even_when_failover_is_configured" {
  command = plan

  variables {
    instance_capacity_type_override_enabled = true
    enable_on_demand_failover_for_errors    = ["InsufficientInstanceCapacity"]
  }

  # The override variant's creation is driven solely by instance_capacity_type_override_enabled
  # (a plan-known flag), not by instance_target_capacity_type or on_demand_failover_for_errors,
  # so that those values are free to remain unknown until apply without breaking the resource's
  # for_each. Both variants exist here even though neither ever tags spot-instances-request.
  assert {
    condition     = toset(keys(aws_launch_template.runner)) == toset(["default", "on_demand_override"])
    error_message = "The override variant must be created whenever instance_capacity_type_override_enabled is set, regardless of on_demand_failover_for_errors."
  }

  assert {
    condition = alltrue([
      for key in keys(aws_launch_template.runner) : !contains([
        for tag_specification in aws_launch_template.runner[key].tag_specifications : tag_specification.resource_type
      ], "spot-instances-request")
    ])
    error_message = "Neither variant should tag spot-instances-request when on_demand_failover_for_errors is configured."
  }
}
