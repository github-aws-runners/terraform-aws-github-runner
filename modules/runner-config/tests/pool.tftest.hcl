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

# The runner archive is injected during packaging, so isolate the common
# housekeeper child in source-checkout tests where that build artifact is absent.
override_module {
  target = module.ssm_housekeeper
}

variables {
  aws_region = "eu-west-1"

  compute_provider = {
    aws = {
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
  }

  runner = {
    labels = ["self-hosted", "linux", "x64"]
    iam = {
      managed_policy_arns = {
        readonly = "arn:aws:iam::aws:policy/ReadOnlyAccess"
      }
      additional_trust_policy_json = jsonencode({
        Version = "2012-10-17"
        Statement = [{
          Sid       = "AdditionalTrustedAccount"
          Effect    = "Allow"
          Action    = "sts:AssumeRole"
          Principal = { AWS = "arn:aws:iam::210987654321:root" }
        }]
      })
    }
  }

  lambda = {
    artifact = {
      s3 = {
        bucket = "my-lambda-bucket"
      }
    }
  }

  github = {
    app_parameters = {
      key_base64      = [{ name = "/github-runner/key-base64", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64" }]
      id              = [{ name = "/github-runner/app-id", arn = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id" }]
      installation_id = [null]
    }
  }

  orchestration_provider = {
    webhook = {
      runner = {
        boot_time_in_minutes = 8
        ephemeral            = true
        jit_config_enabled   = null
        maximum_count        = 9
      }
      github = {
        organization_runners = true
      }
      queue = {
        build = {
          arn = "arn:aws:sqs:eu-west-1:123456789012:build-queue"
          url = "https://sqs.eu-west-1.amazonaws.com/123456789012/build-queue"
        }
      }
      lambda = {
        artifact = {
          s3 = {
            key = "runners.zip"
          }
        }
        pool = {
          config = [{
            schedule_expression = "cron(0 8 * * ? *)"
            size                = 1
          }]
        }
      }
    }
  }

  ssm = {
    paths = {
      root   = "/github-runner"
      tokens = "tokens"
      config = "config"
    }
  }

}

run "plan_with_pool_enabled" {
  command = plan

  assert {
    condition     = module.orchestration_webhook[0].pool != null
    error_message = "Pool module should be enabled when pool.config is non-empty"
  }

  assert {
    condition = (
      !contains(keys(var.runner), "maximum_count")
      && !contains(keys(var.runner), "boot_time_in_minutes")
      && !contains(keys(var.runner), "ephemeral")
      && !contains(keys(var.runner), "jit_config_enabled")
      && var.orchestration_provider.webhook.runner.boot_time_in_minutes == 8
      && var.orchestration_provider.webhook.runner.ephemeral
      && var.orchestration_provider.webhook.runner.jit_config_enabled == null
      && var.orchestration_provider.webhook.runner.maximum_count == 9
      && module.orchestration_webhook[0].scale_up.lambda.environment[0].variables["RUNNERS_MAXIMUM_COUNT"] == "9"
      && module.orchestration_webhook[0].scale_down.lambda.environment[0].variables["RUNNER_BOOT_TIME_IN_MINUTES"] == "8"
      && module.orchestration_webhook[0].pool.lambda.environment[0].variables["RUNNERS_MAXIMUM_COUNT"] == "9"
      && module.orchestration_webhook[0].pool.lambda.environment[0].variables["RUNNER_BOOT_TIME_IN_MINUTES"] == "8"
    )
    error_message = "Runner capacity and boot time must be owned by orchestration_provider.webhook.runner and routed to webhook controls, not retained in the common runner contract."
  }

  assert {
    condition = (
      aws_ssm_parameter.runner_agent_mode.value == "ephemeral"
      && aws_ssm_parameter.jit_config_enabled.value == "true"
    )
    error_message = "Runner-config must serialize the webhook provider's resolved lifecycle contract without duplicating its JIT fallback."
  }

  assert {
    condition = (
      module.orchestration_webhook[0].scale_up.lambda.s3_bucket == "my-lambda-bucket"
      && module.orchestration_webhook[0].scale_up.lambda.s3_key == "runners.zip"
      && local.ssm_housekeeper_artifact.s3.bucket == null
      && endswith(local.ssm_housekeeper_artifact.zip, "/lambdas/functions/control-plane/runners.zip")
    )
    error_message = "The webhook provider must combine its artifact key with the shared bucket while the common SSM housekeeper remains on the packaged archive."
  }

  assert {
    condition = (
      toset(keys(output.provider)) == toset(["aws"])
      && toset(keys(output.provider.aws)) == toset(["ec2", "microvm"])
      && output.provider.aws.microvm == null
    )
    error_message = "The runner configuration must expose resources under the selected provider namespace and type."
  }

  assert {
    condition     = contains(keys(output.provider.aws.ec2), "launch_template")
    error_message = "The runner configuration must expose EC2 resources only under provider.aws.ec2."
  }

  assert {
    condition     = length(aws_iam_role.runner) == 1 && output.runner.role != null
    error_message = "The common runner configuration must create and expose the runner role."
  }

  assert {
    condition = (
      length(module.compute_aws_ec2_trust_policy) == 1
      && length(module.compute_aws_microvm_trust_policy) == 0
      && length(module.compute_aws_microvm) == 0
      && aws_iam_role.runner[0].assume_role_policy == module.compute_aws_ec2_trust_policy[0].assume_role_policy
    )
    error_message = "The common runner role must use the selected EC2 trust-policy submodule output."
  }

  assert {
    condition = (
      output.pool != null
      && toset(keys(output.pool)) == toset(["lambda", "log_group", "role"])
    )
    error_message = "An enabled pool must expose its Lambda, log group, and role through the nested pool output."
  }

  assert {
    condition = (
      toset(keys(output.orchestration_provider)) == toset(["webhook"])
      && output.orchestration_provider.webhook != null
      && output.orchestration_provider.webhook.scale_up != null
      && output.orchestration_provider.webhook.scale_down != null
      && output.orchestration_provider.webhook.pool != null
    )
    error_message = "The canonical orchestration output must group the existing webhook control-plane resources while flat aliases remain available."
  }

  assert {
    condition     = length(jsondecode(module.orchestration_webhook[0].scale_up.lambda.environment[0].variables["SSM_PARAMETER_STORE_TAGS"])) == 0
    error_message = "Runtime Parameter Store tags must remain empty when no module or SSM tags are configured; EC2 bootstrap tags must not leak into them."
  }

  assert {
    condition     = !contains(keys(output.provider.aws.ec2), "role_runner")
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
    error_message = "The common runner configuration must attach every enabled EC2 runner policy by its stable provider key."
  }

  assert {
    condition     = aws_iam_role_policy_attachment.runner["user-readonly"].policy_arn == "arn:aws:iam::aws:policy/ReadOnlyAccess"
    error_message = "The selected EC2 provider contract must return common managed runner policies for one attachment path."
  }

  assert {
    condition = (
      module.orchestration_webhook[0].scale_up.lambda.environment[0].variables["COMPUTE_PROVIDER_TYPE"] == "ec2"
      && module.orchestration_webhook[0].scale_down.lambda.environment[0].variables["COMPUTE_PROVIDER_TYPE"] == "ec2"
    )
    error_message = "Scaling Lambdas must receive the provider type from the selected provider."
  }

  assert {
    condition     = module.orchestration_webhook[0].scale_up.lambda.environment[0].variables["INSTANCE_TYPES"] == "m5.large"
    error_message = "Scale-up must merge the EC2 environment fragment."
  }

  assert {
    condition     = module.orchestration_webhook[0].scale_down.lambda.environment[0].variables["RUNNER_BOOT_TIME_IN_MINUTES"] == "8"
    error_message = "Scale-down must receive boot time from the webhook orchestration configuration."
  }

  assert {
    condition = (
      toset(keys(module.orchestration_webhook[0].scale_up)) == toset(["lambda", "log_group", "role"])
      && toset(keys(module.orchestration_webhook[0].scale_down)) == toset(["lambda", "log_group", "role"])
    )
    error_message = "The scale-runners child module must forward the nested scale-up and scale-down resource contracts."
  }

}

run "housekeeper_uses_component_s3_artifact" {
  command = plan

  variables {
    ssm = {
      paths = {
        root   = "/github-runner"
        tokens = "tokens"
        config = "config"
      }
      housekeeper = {
        lambda = {
          artifact = {
            s3 = {
              key            = "housekeeper/runner-config.zip"
              object_version = "housekeeper-version"
            }
          }
        }
      }
    }
  }

  assert {
    condition = (
      local.ssm_housekeeper_artifact.zip == null
      && local.ssm_housekeeper_artifact.s3.bucket == "my-lambda-bucket"
      && local.ssm_housekeeper_artifact.s3.key == "housekeeper/runner-config.zip"
      && local.ssm_housekeeper_artifact.s3.object_version == "housekeeper-version"
    )
    error_message = "The SSM housekeeper must combine its component-owned S3 key and version with the common Lambda artifact bucket."
  }
}

run "housekeeper_uses_component_local_zip" {
  command = plan

  variables {
    ssm = {
      paths = {
        root   = "/github-runner"
        tokens = "tokens"
        config = "config"
      }
      housekeeper = {
        lambda = {
          artifact = {
            zip = "README.md"
          }
        }
      }
    }
  }

  assert {
    condition = (
      local.ssm_housekeeper_artifact.zip == "README.md"
      && local.ssm_housekeeper_artifact.s3.bucket == null
      && local.ssm_housekeeper_artifact.s3.key == null
      && local.ssm_housekeeper_artifact.s3.object_version == null
    )
    error_message = "The SSM housekeeper must use its component-owned local zip without inheriting the common bucket or webhook artifact."
  }
}

run "rejects_conflicting_housekeeper_artifacts" {
  command = plan

  variables {
    ssm = {
      paths = {
        root   = "/github-runner"
        tokens = "tokens"
        config = "config"
      }
      housekeeper = {
        lambda = {
          artifact = {
            zip = "README.md"
            s3 = {
              key = "housekeeper/runner-config.zip"
            }
          }
        }
      }
    }
  }

  plan_options {
    target = [terraform_data.validate_config]
  }

  expect_failures = [terraform_data.validate_config]
}

run "rejects_housekeeper_s3_without_common_bucket" {
  command = plan

  variables {
    lambda = {
      artifact = {
        s3 = {
          bucket = null
        }
      }
    }
    ssm = {
      paths = {
        root   = "/github-runner"
        tokens = "tokens"
        config = "config"
      }
      housekeeper = {
        lambda = {
          artifact = {
            s3 = {
              key = "housekeeper/runner-config.zip"
            }
          }
        }
      }
    }
  }

  plan_options {
    target = [terraform_data.validate_config]
  }

  expect_failures = [terraform_data.validate_config]
}

run "rejects_missing_orchestration_provider" {
  command = plan

  variables {
    orchestration_provider = {
      webhook = null
    }
  }

  plan_options {
    target = [terraform_data.validate_config]
  }

  expect_failures = [terraform_data.validate_config]
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
    error_message = "An external runner role must remain unmanaged by the common runner configuration."
  }

  assert {
    condition     = output.runner.role == null
    error_message = "The nested runner role output must be null when an external role is selected."
  }


  assert {
    condition     = output.provider.aws.ec2.launch_template.iam_instance_profile[0].name == "github-actions-runner-profile"
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
      aws = {
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
  }

  assert {
    condition     = length(aws_iam_role.runner) == 0 && length(aws_iam_role_policy.runner_provider) == 0
    error_message = "The common runner configuration must not manage an external role."
  }

  assert {
    condition     = output.provider.aws.ec2.launch_template.iam_instance_profile[0].name == "external-runner-profile"
    error_message = "The EC2 launch template must use the external instance profile."
  }
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

  plan_options {
    target = [terraform_data.validate_config]
  }

  expect_failures = [terraform_data.validate_config]
}

run "external_role_rejects_trust_policy_extension" {
  command = plan

  variables {
    runner = {
      labels = ["self-hosted", "linux", "x64"]
      iam = {
        role = {
          arn = "arn:aws:iam::123456789012:role/external/runner-role"
        }
        additional_trust_policy_json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
      }
    }
  }

  plan_options {
    target = [terraform_data.validate_config]
  }

  expect_failures = [terraform_data.validate_config]
}

run "rejects_invalid_trust_policy_extension" {
  command = plan

  variables {
    runner = {
      labels = ["self-hosted", "linux", "x64"]
      iam = {
        additional_trust_policy_json = "{"
      }
    }
  }

  plan_options {
    target = [terraform_data.validate_config]
  }

  expect_failures = [terraform_data.validate_config]
}

run "rejects_empty_compute_provider" {
  command = plan

  variables {
    compute_provider = {}
  }

  plan_options {
    target = [terraform_data.validate_config]
  }

  expect_failures = [terraform_data.validate_config]
}

run "rejects_empty_aws_compute_provider_namespace" {
  command = plan

  variables {
    compute_provider = {
      aws = {}
    }
  }

  plan_options {
    target = [terraform_data.validate_config]
  }

  expect_failures = [terraform_data.validate_config]
}

run "job_retry_uses_common_runner_configuration_identity" {
  command = plan

  variables {
    runner = {
      labels      = ["self-hosted", "linux", "x64"]
      name_prefix = "provider-neutral-"
    }
    orchestration_provider = {
      webhook = {
        github = {
          organization_runners = true
        }
        queue = {
          build = {
            arn = "arn:aws:sqs:eu-west-1:123456789012:build-queue"
            url = "https://sqs.eu-west-1.amazonaws.com/123456789012/build-queue"
          }
        }
        lambda = {
          artifact = {
            s3 = {
              key = "runners.zip"
            }
          }
        }
        job_retry = {
          enabled = true
          lambda = {
            reserved_concurrent_executions = 2
          }
        }
      }
    }
  }

  assert {
    condition     = module.orchestration_webhook[0].job_retry.lambda.function.environment[0].variables["RUNNER_NAME_PREFIX"] == "provider-neutral-"
    error_message = "Job retry must receive the common runner-configuration name prefix."
  }

  assert {
    condition     = module.orchestration_webhook[0].job_retry.lambda.function.reserved_concurrent_executions == 2
    error_message = "Job retry must apply its configured Lambda reserved concurrency."
  }
}

run "routes_lambda_microvm_provider" {
  command = plan

  variables {
    compute_provider_key = "aws_microvm"
    runner = {
      os           = "linux"
      architecture = "arm64"
      labels       = ["self-hosted", "linux", "arm64", "microvm"]
    }
    compute_provider = {
      aws = {
        microvm = {
          image_arn     = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
          image_version = "7"
          ingress_network_connectors = [
            "arn:aws:lambda:eu-west-1:123456789012:network-connector:private-ingress",
          ]
          egress_network_connectors = [
            "arn:aws:lambda:eu-west-1:aws:network-connector:aws-network-connector:INTERNET_EGRESS",
          ]
        }
      }
    }
    orchestration_provider = {
      webhook = {
        runner = {
          ephemeral          = true
          jit_config_enabled = null
        }
        github = {
          organization_runners = true
        }
        queue = {
          build = {
            arn = "arn:aws:sqs:eu-west-1:123456789012:build-queue"
            url = "https://sqs.eu-west-1.amazonaws.com/123456789012/build-queue"
          }
        }
        lambda = {
          artifact = {
            s3 = {
              key = "runners.zip"
            }
          }
        }
      }
    }
  }

  assert {
    condition = (
      length(module.compute_aws_ec2) == 0
      && length(module.compute_aws_ec2_trust_policy) == 0
      && length(module.compute_aws_microvm) == 1
      && length(module.compute_aws_microvm_trust_policy) == 1
      && aws_iam_role.runner[0].assume_role_policy == module.compute_aws_microvm_trust_policy[0].assume_role_policy
      && toset(keys(aws_iam_role_policy.runner_provider)) == toset(["runtime_logs", "ssm_jit"])
      && aws_iam_role_policy.runner_provider["runtime_logs"].name == "runner-microvm-runtime-logs"
      && aws_iam_role_policy.runner_provider["ssm_jit"].name == "runner-microvm-ssm-jit"
    )
    error_message = "The aws.microvm leaf must dispatch only to the namespaced provider modules and attach both required policies to its managed runner role."
  }

  assert {
    condition = (
      toset(keys(output.provider.aws)) == toset(["ec2", "microvm"])
      && output.provider.aws.ec2 == null
      && output.provider.aws.microvm.image_arn == "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
      && output.provider.aws.microvm.image_version == "7"
      && contains(keys(output.provider.aws.microvm), "execution_role_arn")
      && output.provider.aws.microvm.runners_log_groups[0].name == "/github-self-hosted-runners/github-actions/microvm"
    )
    error_message = "The selected MicroVM resources must be exposed only under provider.aws.microvm."
  }

  assert {
    condition = (
      module.orchestration_webhook[0].scale_up.lambda.environment[0].variables["COMPUTE_PROVIDER_TYPE"] == "microvm"
      && module.orchestration_webhook[0].scale_down.lambda.environment[0].variables["COMPUTE_PROVIDER_TYPE"] == "microvm"
      && module.orchestration_webhook[0].scale_up.lambda.environment[0].variables["MICROVM_IMAGE_ARN"] == "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
      && contains(keys(module.orchestration_webhook[0].scale_up.lambda.environment[0].variables), "MICROVM_EXECUTION_ROLE_ARN")
      && module.orchestration_webhook[0].scale_up.lambda.environment[0].variables["MICROVM_LOG_GROUP"] == "/github-self-hosted-runners/github-actions/microvm"
      && module.orchestration_webhook[0].scale_up.lambda.environment[0].variables["MICROVM_METADATA_SSM_PATH"] == "/github-runner/config/microvm-metadata"
      && tomap({
        for tag in jsondecode(module.orchestration_webhook[0].scale_up.lambda.environment[0].variables["MICROVM_METADATA_TAGS"]) :
        tag.Key => tag.Value
        }) == tomap({
        Name                     = "github-actions-action-runner"
        "ghr:environment"        = "github-actions"
        "ghr:runner_name_prefix" = ""
        "ghr:ssm_config_path"    = "/github-runner/config"
      })
      && module.orchestration_webhook[0].scale_down.lambda.environment[0].variables["MICROVM_METADATA_SSM_PATH"] == "/github-runner/config/microvm-metadata"
      && module.orchestration_webhook[0].scale_down.lambda.environment[0].variables["MICROVM_METADATA_TAGS"] == module.orchestration_webhook[0].scale_up.lambda.environment[0].variables["MICROVM_METADATA_TAGS"]
      && module.orchestration_webhook[0].scale_down.lambda.environment[0].variables["RUNNER_BOOT_TIME_IN_MINUTES"] == "5"
      && !contains(keys(module.orchestration_webhook[0].scale_up.lambda.environment[0].variables), "MICROVM_RUN_CONFIG")
      && !contains(keys(module.orchestration_webhook[0].scale_up.lambda.environment[0].variables), "MICROVM_TAGS")
    )
    error_message = "Runner-config must preserve the runtime provider type and merge the canonical MicroVM environment with webhook-owned lifecycle values."
  }
}

run "external_microvm_runner_role_remains_unmanaged" {
  command = plan

  variables {
    runner = {
      os           = "linux"
      architecture = "arm64"
      labels       = ["self-hosted", "linux", "arm64", "microvm"]
      iam = {
        role = {
          arn = "arn:aws:iam::123456789012:role/external/microvm-runner"
        }
      }
    }
    compute_provider = {
      aws = {
        microvm = {
          image_arn = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
        }
      }
    }
    orchestration_provider = {
      webhook = {
        runner = {
          ephemeral = true
        }
        github = {
          organization_runners = true
        }
        queue = {
          build = {
            arn = "arn:aws:sqs:eu-west-1:123456789012:build-queue"
            url = "https://sqs.eu-west-1.amazonaws.com/123456789012/build-queue"
          }
        }
        lambda = {
          artifact = {
            s3 = {
              key = "runners.zip"
            }
          }
        }
      }
    }
  }

  assert {
    condition = (
      length(aws_iam_role.runner) == 0
      && length(aws_iam_role_policy.runner_provider) == 0
      && length(aws_iam_role_policy_attachment.runner) == 0
      && output.provider.aws.microvm.execution_role_arn == "arn:aws:iam::123456789012:role/external/microvm-runner"
    )
    error_message = "An external provider-neutral runner role must remain caller-owned while serving as the MicroVM execution role."
  }
}

run "rejects_multiple_aws_compute_providers" {
  command = plan

  variables {
    compute_provider = {
      aws = {
        ec2 = {
          vpc_id         = "vpc-12345678"
          subnet_ids     = ["subnet-12345678"]
          instance_types = ["m5.large"]
        }
        microvm = {
          image_arn = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
        }
      }
    }
  }

  plan_options {
    target = [terraform_data.validate_config]
  }

  expect_failures = [terraform_data.validate_config]
}

run "rejects_non_ephemeral_microvm_runner" {
  command = plan

  variables {
    runner = {
      os           = "linux"
      architecture = "arm64"
      labels       = ["self-hosted", "linux", "arm64", "microvm"]
    }
    compute_provider = {
      aws = {
        microvm = {
          image_arn = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
        }
      }
    }
    orchestration_provider = {
      webhook = {
        runner = {
          ephemeral = false
        }
        github = {
          organization_runners = true
        }
        queue = {
          build = {
            arn = "arn:aws:sqs:eu-west-1:123456789012:build-queue"
            url = "https://sqs.eu-west-1.amazonaws.com/123456789012/build-queue"
          }
        }
      }
    }
  }

  plan_options {
    target = [terraform_data.validate_config]
  }

  expect_failures = [terraform_data.validate_config]
}

run "rejects_microvm_runner_with_jit_disabled" {
  command = plan

  variables {
    runner = {
      os           = "linux"
      architecture = "arm64"
      labels       = ["self-hosted", "linux", "arm64", "microvm"]
    }
    compute_provider = {
      aws = {
        microvm = {
          image_arn = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
        }
      }
    }
    orchestration_provider = {
      webhook = {
        runner = {
          ephemeral          = true
          jit_config_enabled = false
        }
        github = {
          organization_runners = true
        }
        queue = {
          build = {
            arn = "arn:aws:sqs:eu-west-1:123456789012:build-queue"
            url = "https://sqs.eu-west-1.amazonaws.com/123456789012/build-queue"
          }
        }
      }
    }
  }

  plan_options {
    target = [terraform_data.validate_config]
  }

  expect_failures = [terraform_data.validate_config]
}

run "rejects_non_arm64_microvm_runner" {
  command = plan

  variables {
    runner = {
      os           = "linux"
      architecture = "x64"
      labels       = ["self-hosted", "linux", "x64", "microvm"]
    }
    compute_provider = {
      aws = {
        microvm = {
          image_arn = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
        }
      }
    }
  }

  plan_options {
    target = [terraform_data.validate_config]
  }

  expect_failures = [terraform_data.validate_config]
}

run "rejects_non_linux_microvm_runner" {
  command = plan

  variables {
    runner = {
      os           = "windows"
      architecture = "arm64"
      labels       = ["self-hosted", "windows", "arm64", "microvm"]
    }
    compute_provider = {
      aws = {
        microvm = {
          image_arn = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
        }
      }
    }
  }

  plan_options {
    target = [terraform_data.validate_config]
  }

  expect_failures = [terraform_data.validate_config]
}
