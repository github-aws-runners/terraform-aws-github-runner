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
    ec2 = {
      vpc_id         = "vpc-12345678"
      subnet_ids     = ["subnet-12345678"]
      instance_types = ["m5.large"]
      ami = {
        filter = { state = ["available"] }
        owners = ["amazon"]
        id_ssm_parameter = {
          arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/external-ami-id"
        }
        kms_key = null
      }
      binaries_syncer = {
        s3 = {
          arn = "arn:aws:s3:::my-bucket"
          id  = "my-bucket"
          key = "runners/linux/actions-runner.tar.gz"
        }
      }
      ssm_enabled = true
    }
  }

  runner = {
    labels = ["self-hosted", "linux", "x64"]
  }

  queue = {
    build = {
      arn = "arn:aws:sqs:eu-west-1:123456789012:build-queue"
      url = "https://sqs.eu-west-1.amazonaws.com/123456789012/build-queue"
    }
  }

  # Use S3 bucket to avoid filebase64sha256 needing local zip files
  lambda = {
    s3 = {
      bucket = "my-lambda-bucket"
      key    = "runners.zip"
    }
  }

  github = {
    organization_runners = true
    app_parameters = {
      key_base64 = { name = "/github-runner/key-base64", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64" }
      id         = { name = "/github-runner/app-id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id" }
    }
  }

  ssm = {
    paths = {
      root   = "/github-runner"
      tokens = "tokens"
      config = "config"
    }
  }

  # Enable pool to exercise the pool module and its role type
  pool = {
    config = [{
      schedule_expression = "cron(0 8 * * ? *)"
      size                = 1
    }]
  }
}

run "plan_with_pool_enabled" {
  command = plan

  assert {
    condition     = length(module.pool) == 1
    error_message = "Pool module should be enabled when pool.config is non-empty"
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
    condition     = length(aws_iam_role.runner) == 1 && output.runner.role != null
    error_message = "The common runner stack must create and expose the runner role."
  }

  assert {
    condition = anytrue([
      for principal in data.aws_iam_policy_document.runner_assume_role.statement[0].principals :
      principal.type == "Service" && toset(principal.identifiers) == toset(["ec2.amazonaws.com"])
    ])
    error_message = "The common runner role must use the selected EC2 provider trust relationship before EC2 consumes it."
  }

  assert {
    condition = (
      output.pool != null
      && toset(keys(output.pool)) == toset(["lambda", "log_group", "role"])
    )
    error_message = "An enabled pool must expose its Lambda, log group, and role through the nested pool output."
  }

  assert {
    condition     = length(jsondecode(module.scale_runners.scale_up.lambda.environment[0].variables["SSM_PARAMETER_STORE_TAGS"])) == 0
    error_message = "Runtime Parameter Store tags must remain empty when no module or SSM tags are configured; EC2 bootstrap tags must not leak into them."
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
    condition     = module.scale_runners.scale_up.lambda.environment[0].variables["RUNNER_PROVIDER_TYPE"] == "ec2"
    error_message = "Scale-up must receive the provider type from the selected provider."
  }

  assert {
    condition     = module.scale_runners.scale_up.lambda.environment[0].variables["INSTANCE_TYPES"] == "m5.large"
    error_message = "Scale-up must merge the EC2 environment fragment."
  }

  assert {
    condition     = module.scale_runners.scale_down.lambda.environment[0].variables["RUNNER_BOOT_TIME_IN_MINUTES"] == "5"
    error_message = "Scale-down must merge the EC2 environment fragment."
  }

  assert {
    condition = (
      toset(keys(module.scale_runners.scale_up)) == toset(["lambda", "log_group", "role"])
      && toset(keys(module.scale_runners.scale_down)) == toset(["lambda", "log_group", "role"])
    )
    error_message = "The scale-runners child module must forward the nested scale-up and scale-down resource contracts."
  }

}

run "external_runner_role_is_not_managed_by_common" {
  command = plan

  variables {
    runner = {
      labels = ["self-hosted", "linux", "x64"]
      iam = {
        role = {
          arn = "arn:aws:iam::123456789012:role/external/runner-role"
        }
      }
    }
  }

  assert {
    condition     = length(aws_iam_role.runner) == 0 && length(aws_iam_role_policy.runner_provider) == 0 && length(aws_iam_role_policy_attachment.runner) == 0
    error_message = "An external runner role must remain unmanaged by the common stack."
  }

  assert {
    condition     = output.runner.role == null
    error_message = "The nested runner role output must be null when an external role is selected."
  }


  assert {
    condition     = output.provider.ec2.launch_template.iam_instance_profile[0].name == "github-actions-runner-profile"
    error_message = "EC2 must create an instance profile around an externally supplied runner role when no profile override is provided."
  }
}

run "external_runner_role_and_profile_remain_external" {
  command = plan

  variables {
    runner = {
      labels = ["self-hosted", "linux", "x64"]
      iam = {
        role = {
          arn = "arn:aws:iam::123456789012:role/external/runner-role"
        }
      }
    }
    compute_provider = {
      ec2 = {
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
      ec2 = {
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
    }
  }

  expect_failures = [aws_iam_role.runner]
}

run "empty_runner_iam_uses_common_role" {
  command = plan

  variables {
    runner = {
      labels = ["self-hosted", "linux", "x64"]
      iam    = {}
    }
  }

  assert {
    condition     = length(aws_iam_role.runner) == 1
    error_message = "An empty runner.iam object must use common role ownership."
  }
}

run "external_role_rejects_managed_policy_attachments" {
  command = plan

  variables {
    runner = {
      labels = ["self-hosted", "linux", "x64"]
      iam = {
        role = {
          arn = "arn:aws:iam::123456789012:role/external/runner-role"
        }
        managed_policy_arns = {
          readonly = "arn:aws:iam::aws:policy/ReadOnlyAccess"
        }
      }
    }
  }

  expect_failures = [var.runner]
}

run "requires_distribution_object_when_sync_is_enabled" {
  command = plan

  variables {
    compute_provider = {
      ec2 = {
        vpc_id         = "vpc-12345678"
        subnet_ids     = ["subnet-12345678"]
        instance_types = ["m5.large"]
        binaries_syncer = {
          enabled = true
          s3      = null
        }
      }
    }
  }

  expect_failures = [var.compute_provider]
}

run "rejects_empty_compute_provider" {
  command = plan

  variables {
    compute_provider = {}
  }

  expect_failures = [var.compute_provider]
}

run "job_retry_uses_common_runner_configuration_identity" {
  command = plan

  variables {
    runner = {
      labels      = ["self-hosted", "linux", "x64"]
      name_prefix = "provider-neutral-"
    }
    job_retry = {
      enabled = true
      lambda = {
        reserved_concurrent_executions = 2
      }
    }
  }

  assert {
    condition     = module.job_retry[0].lambda.function.environment[0].variables["RUNNER_NAME_PREFIX"] == "provider-neutral-"
    error_message = "Job retry must receive the common runner-configuration name prefix."
  }

  assert {
    condition     = module.job_retry[0].lambda.function.reserved_concurrent_executions == 2
    error_message = "Job retry must apply its configured Lambda reserved concurrency."
  }
}
