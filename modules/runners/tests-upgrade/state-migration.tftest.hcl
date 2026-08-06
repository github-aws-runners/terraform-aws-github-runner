mock_provider "aws" {
  mock_data "aws_ami" {
    defaults = {
      id               = "ami-1234567890abcdef0"
      name             = "al2023-ami-2023.9.20260101.0-kernel-6.1-x86_64"
      creation_date    = "2026-01-01T00:00:00.000Z"
      deprecation_time = ""
    }
  }

  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
      arn        = "arn:aws:iam::123456789012:user/terraform-test"
      id         = "123456789012"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"logs:CreateLogStream\",\"Resource\":\"*\"}]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/upgrade-test"
    }
  }

  mock_resource "aws_iam_policy" {
    defaults = {
      arn = "arn:aws:iam::123456789012:policy/upgrade-test"
    }
  }

  mock_resource "aws_ssm_parameter" {
    defaults = {
      arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/upgrade/value"
    }
  }

  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:eu-west-1:123456789012:log-group:upgrade-test"
    }
  }

  mock_resource "aws_launch_template" {
    defaults = {
      arn            = "arn:aws:ec2:eu-west-1:123456789012:launch-template/lt-upgrade-test"
      latest_version = 1
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:eu-west-1:123456789012:function:upgrade-test"
    }
  }

  mock_resource "aws_cloudwatch_event_rule" {
    defaults = {
      arn = "arn:aws:events:eu-west-1:123456789012:rule/upgrade-test"
    }
  }
}

run "apply_pre_provider_split_external_ami" {
  command   = apply
  state_key = "provider-split-external-ami"

  module {
    source = "./tests-upgrade/fixtures/pre-provider-split"
  }

  variables {
    prefix           = "upgrade-test-external"
    use_external_ami = true
  }
}

run "plan_provider_split_external_ami" {
  command   = plan
  state_key = "provider-split-external-ami"

  plan_options {
    refresh = false
  }

  variables {
    aws_region = "eu-west-1"
    vpc_id     = "vpc-12345678"
    subnet_ids = ["subnet-12345678"]
    prefix     = "upgrade-test-external"

    ami = {
      filter               = { state = ["available"] }
      owners               = ["amazon"]
      id_ssm_parameter_arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/shared/runner-ami"
      kms_key_arn          = null
    }

    instance_types              = ["m5.large"]
    enable_userdata             = false
    enable_ssm_on_runners       = true
    runner_labels               = ["self-hosted", "linux", "x64"]
    enable_organization_runners = true

    s3_runner_binaries = {
      arn = "arn:aws:s3:::runner-binaries"
      id  = "runner-binaries"
      key = "runners/linux/actions-runner.tar.gz"
    }

    sqs_build_queue = {
      arn = "arn:aws:sqs:eu-west-1:123456789012:upgrade-test-external"
      url = "https://sqs.eu-west-1.amazonaws.com/123456789012/upgrade-test-external"
    }

    github_app_parameters = {
      key_base64 = {
        name = "/github-action-runners/upgrade/app/key-base64"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/upgrade/app/key-base64"
      }
      id = {
        name = "/github-action-runners/upgrade/app/id"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/upgrade/app/id"
      }
    }

    ssm_paths = {
      root   = "/github-action-runners/upgrade"
      tokens = "runners/tokens"
      config = "runners/config"
    }

    lambda_s3_bucket      = "lambda-artifacts"
    runners_lambda_s3_key = "runners.zip"

    runner_iam_role_managed_policy_arns = ["arn:aws:iam::aws:policy/ReadOnlyAccess"]
    tracing_config = {
      mode = "Active"
    }
  }

  assert {
    condition     = output.launch_template.id == run.apply_pre_provider_split_external_ami.moved_resource_ids.launch_template
    error_message = "The external-AMI upgrade must retain the launch template state."
  }

  assert {
    condition     = output.role_runner[0].id == run.apply_pre_provider_split_external_ami.moved_resource_ids.runner_role
    error_message = "The external-AMI upgrade must retain the runner role state."
  }

  assert {
    condition     = output.runners_log_groups[*].id == run.apply_pre_provider_split_external_ami.moved_resource_ids.runner_log_groups
    error_message = "The external-AMI upgrade must retain the optional runner log-group state."
  }
}

run "apply_pre_provider_split_managed_ami" {
  command   = apply
  state_key = "provider-split-managed-ami"

  module {
    source = "./tests-upgrade/fixtures/pre-provider-split"
  }

  variables {
    prefix           = "upgrade-test-managed"
    use_external_ami = false
  }
}

run "plan_provider_split_managed_ami" {
  command   = plan
  state_key = "provider-split-managed-ami"

  plan_options {
    refresh = false
  }

  variables {
    aws_region = "eu-west-1"
    vpc_id     = "vpc-12345678"
    subnet_ids = ["subnet-12345678"]
    prefix     = "upgrade-test-managed"

    ami                         = null
    instance_types              = ["m5.large"]
    enable_userdata             = false
    enable_ssm_on_runners       = true
    runner_labels               = ["self-hosted", "linux", "x64"]
    enable_organization_runners = true

    s3_runner_binaries = {
      arn = "arn:aws:s3:::runner-binaries"
      id  = "runner-binaries"
      key = "runners/linux/actions-runner.tar.gz"
    }

    sqs_build_queue = {
      arn = "arn:aws:sqs:eu-west-1:123456789012:upgrade-test-managed"
      url = "https://sqs.eu-west-1.amazonaws.com/123456789012/upgrade-test-managed"
    }

    github_app_parameters = {
      key_base64 = {
        name = "/github-action-runners/upgrade/app/key-base64"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/upgrade/app/key-base64"
      }
      id = {
        name = "/github-action-runners/upgrade/app/id"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/upgrade/app/id"
      }
    }

    ssm_paths = {
      root   = "/github-action-runners/upgrade"
      tokens = "runners/tokens"
      config = "runners/config"
    }

    lambda_s3_bucket      = "lambda-artifacts"
    runners_lambda_s3_key = "runners.zip"

    runner_iam_role_managed_policy_arns = ["arn:aws:iam::aws:policy/ReadOnlyAccess"]
    tracing_config = {
      mode = "Active"
    }
  }

  assert {
    condition     = output.launch_template.id == run.apply_pre_provider_split_managed_ami.moved_resource_ids.launch_template
    error_message = "The module-managed-AMI upgrade must retain the launch template state."
  }

  assert {
    condition     = output.role_runner[0].id == run.apply_pre_provider_split_managed_ami.moved_resource_ids.runner_role
    error_message = "The module-managed-AMI upgrade must retain the runner role state."
  }

  assert {
    condition     = output.runners_log_groups[*].id == run.apply_pre_provider_split_managed_ami.moved_resource_ids.runner_log_groups
    error_message = "The module-managed-AMI upgrade must retain the optional runner log-group state."
  }
}
