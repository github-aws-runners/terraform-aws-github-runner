mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"lambda.amazonaws.com\"},\"Action\":\"sts:AssumeRole\"}]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/runner-test"
    }
  }

  mock_resource "aws_ssm_parameter" {
    defaults = {
      arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/ami-id"
    }
  }
}

variables {
  aws_region = "eu-west-1"

  compute_provider = {
    type = "ec2"
    ec2 = {
      vpc_id         = "vpc-12345678"
      subnet_ids     = ["subnet-12345678"]
      instance_types = ["m5.large"]
      ami = {
        filter               = { state = ["available"] }
        owners               = ["amazon"]
        id_ssm_parameter_arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/external-ami-id"
        kms_key_arn          = null
      }
      s3_runner_binaries = {
        arn = "arn:aws:s3:::my-bucket"
        id  = "my-bucket"
        key = "runners/linux/actions-runner.tar.gz"
      }
      enable_ssm_on_runners = true
    }
  }

  sqs_build_queue = {
    arn = "arn:aws:sqs:eu-west-1:123456789012:build-queue"
    url = "https://sqs.eu-west-1.amazonaws.com/123456789012/build-queue"
  }

  enable_organization_runners = true
  runner_labels               = ["self-hosted", "linux", "x64"]

  # Use S3 bucket to avoid filebase64sha256 needing local zip files
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

  # Enable pool to exercise the pool module and its role type
  pool_config = [{
    schedule_expression = "cron(0 8 * * ? *)"
    size                = 1
  }]
}

run "plan_with_pool_enabled" {
  command = plan

  assert {
    condition     = length(module.pool) == 1
    error_message = "Pool module should be enabled when pool_config is non-empty"
  }

  assert {
    condition     = output.provider.type == "ec2"
    error_message = "The runner stack must expose the selected compute provider type."
  }

  assert {
    condition     = contains(keys(output.provider.ec2), "launch_template")
    error_message = "The runner stack must expose EC2 resources only under provider.ec2."
  }

  assert {
    condition     = length(aws_iam_role.runner) == 1 && length(output.role_runner) == 1
    error_message = "The common runner stack must create and expose the runner role."
  }

  assert {
    condition     = !contains(keys(output.provider.ec2), "role_runner")
    error_message = "The common runner role must not be duplicated in the EC2 resource output."
  }

  assert {
    condition = toset(keys(aws_iam_role_policy.runner_provider)) == toset([
      "ssm_parameters",
      "describe_tags",
      "create_tags",
      "terminate_self",
      "session_manager",
      "distribution_bucket",
      "cloudwatch",
    ])
    error_message = "The common stack must attach every enabled EC2 runner policy by its stable provider key."
  }

  assert {
    condition     = aws_lambda_function.scale_up.environment[0].variables["RUNNER_PROVIDER_TYPE"] == "ec2"
    error_message = "Scale-up must receive the provider type from the selected provider."
  }

  assert {
    condition     = aws_lambda_function.scale_up.environment[0].variables["INSTANCE_TYPES"] == "m5.large"
    error_message = "Scale-up must merge the EC2 environment fragment."
  }

  assert {
    condition     = aws_lambda_function.scale_down.environment[0].variables["RUNNER_BOOT_TIME_IN_MINUTES"] == "5"
    error_message = "Scale-down must merge the EC2 environment fragment."
  }

  assert {
    condition     = length(aws_iam_role_policy_attachment.ami_id_ssm_parameter_read) == 1
    error_message = "An external AMI SSM parameter must plan the scale-up policy attachment even when its policy ARN is not known yet."
  }

}

run "external_runner_role_is_not_managed_by_common" {
  command = plan

  variables {
    runner_iam = {
      role = {
        arn = "arn:aws:iam::123456789012:role/external/runner-role"
      }
    }
  }

  assert {
    condition     = length(aws_iam_role.runner) == 0 && length(aws_iam_role_policy.runner_provider) == 0 && length(aws_iam_role_policy_attachment.runner) == 0
    error_message = "An external runner role must remain unmanaged by the common stack."
  }

  assert {
    condition     = length(output.role_runner) == 0
    error_message = "The role_runner output must be empty when an external role is selected."
  }


  assert {
    condition     = output.provider.ec2.launch_template.iam_instance_profile[0].name == "github-actions-runner-profile"
    error_message = "EC2 must create an instance profile around an externally supplied runner role when no profile override is provided."
  }
}

run "external_runner_role_and_profile_remain_external" {
  command = plan

  variables {
    runner_iam = {
      role = {
        arn = "arn:aws:iam::123456789012:role/external/runner-role"
      }
    }
    compute_provider = {
      type = "ec2"
      ec2 = {
        vpc_id         = "vpc-12345678"
        subnet_ids     = ["subnet-12345678"]
        instance_types = ["m5.large"]
        instance_profile = {
          name = "external-runner-profile"
        }
        enable_runner_binaries_syncer = false
      }
    }
  }

  assert {
    condition     = length(aws_iam_role.runner) == 0 && length(aws_iam_role_policy.runner_provider) == 0
    error_message = "The common stack must not manage an external role."
  }

  assert {
    condition     = output.provider.ec2.launch_template.iam_instance_profile[0].name == "external-runner-profile"
    error_message = "The EC2 launch template must use the external instance profile."
  }
}

run "external_profile_requires_external_role" {
  command = plan

  variables {
    compute_provider = {
      type = "ec2"
      ec2 = {
        vpc_id         = "vpc-12345678"
        subnet_ids     = ["subnet-12345678"]
        instance_types = ["m5.large"]
        instance_profile = {
          name = "external-runner-profile"
        }
        enable_runner_binaries_syncer = false
      }
    }
  }

  expect_failures = [aws_iam_role.runner]
}

run "empty_runner_iam_uses_common_role" {
  command = plan

  variables {
    runner_iam = {}
  }

  assert {
    condition     = length(aws_iam_role.runner) == 1
    error_message = "An empty runner_iam object must use common role ownership."
  }
}

run "external_role_rejects_managed_policy_attachments" {
  command = plan

  variables {
    runner_iam = {
      role = {
        arn = "arn:aws:iam::123456789012:role/external/runner-role"
      }
      managed_policy_arns = {
        readonly = "arn:aws:iam::aws:policy/ReadOnlyAccess"
      }
    }
  }

  expect_failures = [var.runner_iam]
}

run "requires_distribution_object_when_sync_is_enabled" {
  command = plan

  variables {
    compute_provider = {
      type = "ec2"
      ec2 = {
        vpc_id                        = "vpc-12345678"
        subnet_ids                    = ["subnet-12345678"]
        instance_types                = ["m5.large"]
        enable_runner_binaries_syncer = true
        s3_runner_binaries            = null
      }
    }
  }

  expect_failures = [var.compute_provider]
}

run "rejects_unimplemented_compute_provider" {
  command = plan

  variables {
    compute_provider = {
      type = "microvm"
    }
  }

  expect_failures = [var.compute_provider]
}

run "job_retry_uses_common_lane_identity" {
  command = plan

  variables {
    runner_name_prefix = "provider-neutral-"
    job_retry = {
      enable = true
    }
  }

  assert {
    condition     = module.job_retry[0].lambda.function.function.environment[0].variables["RUNNER_NAME_PREFIX"] == "provider-neutral-"
    error_message = "Job retry must receive the common lane runner-name prefix."
  }
}
