mock_provider "aws" {
  mock_data "aws_ami" {
    defaults = {
      id               = "ami-1234567890abcdef0"
      name             = "runner-test"
      creation_date    = "2026-01-01T00:00:00.000Z"
      deprecation_time = ""
    }
  }
}

variables {
  aws_region = "eu-west-1"
  vpc_id     = "vpc-12345678"
  subnet_ids = ["subnet-12345678"]
  prefix     = "provider-test"

  ami = {
    filter               = { state = ["available"] }
    owners               = ["amazon"]
    id_ssm_parameter_arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/ami-id"
    kms_key_arn          = null
  }

  instance_types = ["m5.large"]

  s3_runner_binaries                   = null
  enable_runner_binaries_syncer        = false
  enable_ssm_on_runners                = false
  enable_cloudwatch_agent              = false
  enable_managed_runner_security_group = true

  iam_overrides = {
    override_instance_profile = true
    instance_profile_name     = "provider-test-runner-profile"
    override_runner_role      = true
    runner_role_arn           = "arn:aws:iam::123456789012:role/provider-test-runner"
  }

  ssm_paths = {
    root   = "/github-runner/provider-test"
    tokens = "tokens"
    config = "config"
  }
}

run "exports_ec2_only_control_plane_fragments" {
  command = plan

  assert {
    condition     = output.provider.type == "ec2"
    error_message = "The provider contract must identify EC2."
  }

  assert {
    condition     = output.provider.scale_up.environment_variables["INSTANCE_TYPES"] == "m5.large"
    error_message = "The provider contract must expose EC2 scale-up environment variables."
  }

  assert {
    condition     = output.provider.scale_down.environment_variables["RUNNER_BOOT_TIME_IN_MINUTES"] == 5
    error_message = "The provider contract must expose the EC2 scale-down boot grace period."
  }

  assert {
    condition     = strcontains(output.provider.scale_up.iam_policy_json, "ec2:RunInstances")
    error_message = "The EC2 provider must own EC2 scale-up permissions."
  }

  assert {
    condition     = !strcontains(output.provider.scale_up.iam_policy_json, "sqs:ReceiveMessage")
    error_message = "The EC2 provider must not own common build-queue permissions."
  }

  assert {
    condition     = strcontains(output.provider.pool.iam_policy_json, "iam:PassRole")
    error_message = "The EC2 provider must expose pool permissions for its runner role."
  }

  assert {
    condition     = output.provider.scale_up.managed_policy_enabled
    error_message = "An external AMI SSM parameter must enable the scale-up managed policy attachment at plan time."
  }

  assert {
    condition     = output.provider.pool.managed_policy_enabled
    error_message = "An external AMI SSM parameter must enable the pool managed policy attachment at plan time."
  }
}
