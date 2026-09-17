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

  mock_resource "aws_cloudwatch_log_group" {
    defaults = {
      arn = "arn:aws:logs:eu-west-1:123456789012:log-group:/github-self-hosted-runners/microvm-test/microvm"
    }
  }
}

variables {
  aws_region = "eu-west-1"
  prefix     = "microvm-test"

  tags = {
    Module = "runner"
    Name   = "module"
  }

  config = {
    image_arn     = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
    image_version = "3"
    ingress_network_connectors = [
      "arn:aws:lambda:eu-west-1:123456789012:network-connector:ingress",
    ]
    egress_network_connectors = [
      "arn:aws:lambda:eu-west-1:123456789012:network-connector:egress",
    ]
    environment_variables = {
      MICROVM_CLUSTER               = "runner-cluster"
      MICROVM_IMAGE_ARN             = "caller-cannot-override-provider-contract"
      MICROVM_METADATA_SSM_PATH     = "/caller/cannot/override/provider-contract"
      MICROVM_METADATA_TAGS         = "retired-provider-contract"
      MICROVM_RUNNER_CONFIG_SSM_ARN = "retired-provider-contract"
      SSM_TOKEN_PATH                = "/caller/cannot/override/token-path"
    }
  }

  runner = {
    name_prefix = "microvm-"
    iam = {
      role = {
        arn  = "arn:aws:iam::123456789012:role/microvm-test-runner"
        name = "microvm-test-runner"
      }
      managed_policy_arns = {
        readonly = "arn:aws:iam::aws:policy/ReadOnlyAccess"
      }
    }
  }

  ssm = {
    paths = {
      root   = "/github-action-runners"
      tokens = "tokens"
      config = "config"
    }
    tags = {
      Name       = "ssm"
      Precedence = "ssm"
      Ssm        = "shared"
    }
    parameters = {
      tags = {
        Name                     = "parameter"
        Parameter                = "metadata"
        Precedence               = "parameter"
        "ghr:environment"        = "caller-cannot-override"
        "ghr:runner_name_prefix" = "caller-cannot-override"
        "ghr:ssm_config_path"    = "caller-cannot-override"
      }
    }
  }

  observability = {
    logs = {
      retention_in_days = 30
      kms_key_id        = "arn:aws:kms:eu-west-1:123456789012:key/runtime-logs"
      class             = "INFREQUENT_ACCESS"
      tags = {
        Name    = "microvm-runtime-logs"
        LogOnly = "runtime"
      }
    }
  }
}

run "exposes_microvm_control_plane_contract" {
  command = apply

  assert {
    condition     = toset(keys(output.provider)) == toset(["environment_variables", "policies", "resources"])
    error_message = "The MicroVM provider contract must expose only integration and resource data."
  }

  assert {
    condition = (
      output.provider.environment_variables.scale_up["MICROVM_CLUSTER"] == "runner-cluster"
      && output.provider.environment_variables.scale_up["MICROVM_IMAGE_ARN"] == "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
      && output.provider.environment_variables.scale_up["MICROVM_IMAGE_VERSION"] == "3"
      && output.provider.environment_variables.scale_up["MICROVM_EXECUTION_ROLE_ARN"] == "arn:aws:iam::123456789012:role/microvm-test-runner"
      && jsondecode(output.provider.environment_variables.scale_up["MICROVM_INGRESS_NETWORK_CONNECTORS"])[0] == "arn:aws:lambda:eu-west-1:123456789012:network-connector:ingress"
      && jsondecode(output.provider.environment_variables.scale_up["MICROVM_EGRESS_NETWORK_CONNECTORS"])[0] == "arn:aws:lambda:eu-west-1:123456789012:network-connector:egress"
      && output.provider.environment_variables.scale_up["MICROVM_LOG_GROUP"] == "/github-self-hosted-runners/microvm-test/microvm"
      && output.provider.environment_variables.scale_up["MICROVM_METADATA_SSM_PATH"] == "/github-action-runners/config/microvm-metadata"
      && output.provider.environment_variables.scale_up["SSM_TOKEN_PATH"] == "/github-action-runners/tokens"
    )
    error_message = "The MicroVM provider must map every configured runtime input to the canonical Lambda environment contract."
  }

  assert {
    condition = (
      toset(keys(output.provider.environment_variables.scale_up)) == toset([
        "MICROVM_CLUSTER",
        "MICROVM_EGRESS_NETWORK_CONNECTORS",
        "MICROVM_EXECUTION_ROLE_ARN",
        "MICROVM_IMAGE_ARN",
        "MICROVM_IMAGE_VERSION",
        "MICROVM_INGRESS_NETWORK_CONNECTORS",
        "MICROVM_LOG_GROUP",
        "MICROVM_METADATA_SSM_PATH",
        "SSM_TOKEN_PATH",
      ])
      && output.provider.environment_variables.scale_up == output.provider.environment_variables.scale_down
      && output.provider.environment_variables.scale_up == output.provider.environment_variables.pool
      && !contains(keys(output.provider.environment_variables.scale_up), "RUNNER_BOOT_TIME_IN_MINUTES")
      && !contains(keys(output.provider.environment_variables.scale_up), "MICROVM_IMAGE_IDENTIFIER")
      && !contains(keys(output.provider.environment_variables.scale_up), "MICROVM_MAXIMUM_DURATION_IN_SECONDS")
      && !contains(keys(output.provider.environment_variables.scale_up), "MICROVM_RUN_CONFIG")
      && !contains(keys(output.provider.environment_variables.scale_up), "MICROVM_TAGS")
      && !contains(keys(output.provider.environment_variables.scale_up), "MICROVM_METADATA_TAGS")
      && !contains(keys(output.provider.environment_variables.scale_up), "MICROVM_RUNNER_CONFIG_SSM_ARN")
    )
    error_message = "All three control-plane fragments must match the runtime key inventory and omit stale or webhook-owned keys."
  }

  assert {
    condition = (
      data.aws_iam_policy_document.scale_up.statement[0].actions == toset(["lambda:ListMicrovms", "lambda:PassNetworkConnector"])
      && data.aws_iam_policy_document.scale_up.statement[0].resources == toset(["*"])
      && data.aws_iam_policy_document.scale_up.statement[1].actions == toset(["lambda:RunMicrovm", "lambda:TerminateMicrovm"])
      && data.aws_iam_policy_document.scale_up.statement[1].resources == toset(["arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"])
    )
    error_message = "Scale-up and pool must receive the MicroVM inventory, connector, launch, and cleanup permissions."
  }

  assert {
    condition = (
      data.aws_iam_policy_document.scale_up.statement[2].actions == toset(["ssm:AddTagsToResource", "ssm:DeleteParameter", "ssm:PutParameter"])
      && data.aws_iam_policy_document.scale_up.statement[2].resources == toset(["arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/microvm-metadata/*"])
      && data.aws_iam_policy_document.scale_up.statement[3].actions == toset(["ssm:GetParametersByPath"])
      && data.aws_iam_policy_document.scale_up.statement[3].resources == toset([
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/microvm-metadata",
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/microvm-metadata/*",
      ])
      && data.aws_iam_policy_document.scale_up.statement[4].actions == toset(["ssm:GetParameters"])
      && data.aws_iam_policy_document.scale_up.statement[4].resources == toset(["arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/microvm-metadata/*"])
    )
    error_message = "Scale-up and pool must read the metadata hierarchy and exact JIT fence records while keeping metadata writes child-scoped."
  }

  assert {
    condition = (
      data.aws_iam_policy_document.scale_up.statement[5].actions == toset(["iam:PassRole"])
      && data.aws_iam_policy_document.scale_up.statement[5].resources == toset(["arn:aws:iam::123456789012:role/microvm-test-runner"])
      && length(data.aws_iam_policy_document.scale_up.statement[5].condition) == 0
      && data.aws_iam_policy_document.scale_up.statement[6].actions == toset(["ssm:DeleteParameter"])
      && data.aws_iam_policy_document.scale_up.statement[6].resources == toset(["arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/tokens/*"])
    )
    error_message = "Scale-up and pool must receive exact runner-role PassRole and lane-token cleanup grants."
  }

  assert {
    condition = (
      data.aws_iam_policy_document.scale_down.statement[0].actions == toset(["lambda:ListMicrovms"])
      && data.aws_iam_policy_document.scale_down.statement[0].resources == toset(["*"])
      && data.aws_iam_policy_document.scale_down.statement[1].actions == toset(["lambda:TerminateMicrovm"])
      && data.aws_iam_policy_document.scale_down.statement[1].resources == toset(["arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"])
      && data.aws_iam_policy_document.scale_down.statement[2].actions == toset(["ssm:DeleteParameter", "ssm:PutParameter"])
      && data.aws_iam_policy_document.scale_down.statement[2].resources == toset(["arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/microvm-metadata/*"])
      && data.aws_iam_policy_document.scale_down.statement[3].actions == toset(["ssm:GetParametersByPath"])
      && data.aws_iam_policy_document.scale_down.statement[3].resources == toset([
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/microvm-metadata",
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/microvm-metadata/*",
      ])
      && data.aws_iam_policy_document.scale_down.statement[4].actions == toset(["ssm:DeleteParameter"])
      && data.aws_iam_policy_document.scale_down.statement[4].resources == toset(["arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/tokens/*"])
    )
    error_message = "Scale-down must receive lifecycle, metadata, and exact lane-token cleanup permissions."
  }

  assert {
    condition = (
      length(setintersection(toset(flatten(data.aws_iam_policy_document.scale_up.statement[*].actions)), toset(["lambda:ListTags", "lambda:TagResource", "lambda:UntagResource"]))) == 0
      && length(setintersection(toset(flatten(data.aws_iam_policy_document.scale_down.statement[*].actions)), toset(["lambda:ListTags", "lambda:TagResource", "lambda:UntagResource"]))) == 0
    )
    error_message = "The MicroVM provider must not grant unsupported runtime tagging actions."
  }

  assert {
    condition = (
      toset(keys(output.provider.policies)) == toset(["runner", "scale_up", "scale_down", "pool"])
      && toset(keys(output.provider.policies.runner.inline_policies)) == toset(["cloudwatch", "runner_metadata", "runtime_logs", "ssm_jit"])
      && output.provider.policies.runner.inline_policies.cloudwatch.name == "runner-microvm-cloudwatch"
      && output.provider.policies.runner.inline_policies.runner_metadata.name == "runner-microvm-metadata"
      && output.provider.policies.runner.inline_policies.ssm_jit.name == "runner-microvm-ssm-jit"
      && output.provider.policies.runner.inline_policies.runtime_logs.name == "runner-microvm-runtime-logs"
      && output.provider.policies.runner.managed_policy_arns["readonly"] == "arn:aws:iam::aws:policy/ReadOnlyAccess"
      && !output.provider.policies.scale_up.managed_policy_enabled
      && !output.provider.policies.pool.managed_policy_enabled
    )
    error_message = "The MicroVM provider must return policy fragments grouped by common component."
  }

  assert {
    condition = (
      data.aws_iam_policy_document.runner_ssm_jit.statement[0].actions == toset(["ssm:DeleteParameter", "ssm:GetParameter"])
      && data.aws_iam_policy_document.runner_ssm_jit.statement[0].resources == toset(["arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/tokens/*"])
      && data.aws_iam_policy_document.runner_metadata.statement[0].actions == toset(["ssm:GetParameter"])
      && data.aws_iam_policy_document.runner_metadata.statement[0].resources == toset([
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/enable_cloudwatch",
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/microvm-metadata/*.tags",
      ])
      && data.aws_iam_policy_document.runner_cloudwatch[0].statement[0].actions == toset(["ssm:GetParameter"])
      && data.aws_iam_policy_document.runner_cloudwatch[0].statement[0].resources == toset(["arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/cloudwatch_agent_config_runner"])
      && data.aws_iam_policy_document.runner_cloudwatch[0].statement[1].actions == toset(["logs:CreateLogStream", "logs:DescribeLogStreams", "logs:PutLogEvents"])
      && data.aws_iam_policy_document.runner_cloudwatch[0].statement[1].resources == toset([
        "arn:aws:logs:eu-west-1:123456789012:log-group:/github-self-hosted-runners/microvm-test/internal_service:*",
        "arn:aws:logs:eu-west-1:123456789012:log-group:/github-self-hosted-runners/microvm-test/run:*",
        "arn:aws:logs:eu-west-1:123456789012:log-group:/github-self-hosted-runners/microvm-test/runner:*",
      ])
      && length(data.aws_iam_policy_document.runner_runtime_logs.statement) == 1
      && data.aws_iam_policy_document.runner_runtime_logs.statement[0].actions == toset(["logs:CreateLogStream", "logs:PutLogEvents"])
      && data.aws_iam_policy_document.runner_runtime_logs.statement[0].resources == toset(["arn:aws:logs:eu-west-1:123456789012:log-group:/github-self-hosted-runners/microvm-test/microvm:*"])
    )
    error_message = "Managed MicroVM runners must receive exact lane configuration, metadata, JIT, native-runtime, and CloudWatch-agent permissions."
  }

  assert {
    condition = (
      toset(keys(output.provider.resources)) == toset(["execution_role_arn", "image_arn", "image_version", "logfiles", "runners_log_groups"])
      && output.provider.resources.image_arn == "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
      && output.provider.resources.image_version == "3"
      && output.provider.resources.execution_role_arn == "arn:aws:iam::123456789012:role/microvm-test-runner"
      && length(output.provider.resources.runners_log_groups) == 4
      && output.provider.resources.runners_log_groups[0].name == "/github-self-hosted-runners/microvm-test/microvm"
      && toset(slice(output.provider.resources.runners_log_groups[*].name, 1, 4)) == toset([
        "/github-self-hosted-runners/microvm-test/internal_service",
        "/github-self-hosted-runners/microvm-test/run",
        "/github-self-hosted-runners/microvm-test/runner",
      ])
      && output.provider.resources.logfiles == local.logfiles
    )
    error_message = "The MicroVM provider must expose its selected image, execution role, native runtime group, and CloudWatch-agent resources."
  }

  assert {
    condition = (
      aws_cloudwatch_log_group.runtime.name == "/github-self-hosted-runners/microvm-test/microvm"
      && aws_cloudwatch_log_group.runtime.retention_in_days == 30
      && aws_cloudwatch_log_group.runtime.kms_key_id == "arn:aws:kms:eu-west-1:123456789012:key/runtime-logs"
      && aws_cloudwatch_log_group.runtime.log_group_class == "INFREQUENT_ACCESS"
      && aws_cloudwatch_log_group.runtime.tags == tomap({
        Name    = "microvm-runtime-logs"
        Module  = "runner"
        LogOnly = "runtime"
      })
    )
    error_message = "The MicroVM provider must own its lane-scoped log group and apply the common observability lifecycle and tag scopes."
  }

  assert {
    condition = (
      aws_ssm_parameter.runner_enable_cloudwatch.name == "/github-action-runners/config/enable_cloudwatch"
      && aws_ssm_parameter.runner_enable_cloudwatch.value == "true"
      && length(aws_ssm_parameter.cloudwatch_agent_config_runner) == 1
      && aws_ssm_parameter.cloudwatch_agent_config_runner[0].name == "/github-action-runners/config/cloudwatch_agent_config_runner"
      && aws_ssm_parameter.runner_enable_cloudwatch.tags["Name"] == "parameter"
      && aws_ssm_parameter.runner_enable_cloudwatch.tags["Module"] == "runner"
      && aws_ssm_parameter.runner_enable_cloudwatch.tags["Ssm"] == "shared"
      && aws_ssm_parameter.runner_enable_cloudwatch.tags["Parameter"] == "metadata"
      && aws_ssm_parameter.runner_enable_cloudwatch.tags["Precedence"] == "parameter"
      && aws_ssm_parameter.cloudwatch_agent_config_runner[0].tags == aws_ssm_parameter.runner_enable_cloudwatch.tags
    )
    error_message = "The MicroVM provider must publish the EC2-compatible CloudWatch enablement and agent-config parameters with standard SSM tag precedence."
  }

  assert {
    condition = (
      length(local.logfiles) == 3
      && local.logfiles[0].file_path == "/var/log/microvm/internal-services.log"
      && local.logfiles[0].log_group_name == "/github-self-hosted-runners/microvm-test/internal_service"
      && local.logfiles[1].file_path == "/var/log/microvm/run.log"
      && local.logfiles[1].log_group_name == "/github-self-hosted-runners/microvm-test/run"
      && local.logfiles[2].file_path == "/opt/actions-runner/_diag/Runner_**.log"
      && local.logfiles[2].log_group_name == "/github-self-hosted-runners/microvm-test/runner"
      && alltrue([for log_file in local.logfiles : (
        log_file.log_group_class == "STANDARD"
        && log_file.log_stream_name == "{microvm_id}"
      )])
      && length(jsondecode(aws_ssm_parameter.cloudwatch_agent_config_runner[0].value).logs.logs_collected.files.collect_list) == 3
      && toset(aws_cloudwatch_log_group.gh_runners[*].name) == toset(local.runner_log_group_names)
      && alltrue([for log_group in aws_cloudwatch_log_group.gh_runners : (
        log_group.retention_in_days == 30
        && log_group.kms_key_id == "arn:aws:kms:eu-west-1:123456789012:key/runtime-logs"
        && log_group.tags == aws_cloudwatch_log_group.runtime.tags
      )])
    )
    error_message = "The default MicroVM agent configuration must route internal-service, run, and runner files to separately managed log groups."
  }
}

run "normalizes_ssm_paths_and_arns" {
  command = plan

  variables {
    ssm = {
      paths = {
        root   = "/github-action-runners/"
        tokens = "/tokens/"
        config = "/config/"
      }
    }
  }

  assert {
    condition = (
      output.provider.environment_variables.scale_up["MICROVM_METADATA_SSM_PATH"] == "/github-action-runners/config/microvm-metadata"
      && output.provider.environment_variables.scale_up["SSM_TOKEN_PATH"] == "/github-action-runners/tokens"
      && data.aws_iam_policy_document.scale_up.statement[6].resources == toset(["arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/tokens/*"])
      && data.aws_iam_policy_document.scale_down.statement[4].resources == toset(["arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/tokens/*"])
      && data.aws_iam_policy_document.runner_ssm_jit.statement[0].resources == toset(["arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/tokens/*"])
      && data.aws_iam_policy_document.runner_metadata.statement[0].resources == toset([
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/enable_cloudwatch",
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/microvm-metadata/*.tags",
      ])
    )
    error_message = "The MicroVM provider must normalize SSM path segments before exposing hook values or IAM resources."
  }
}

run "accepts_external_runner_role_and_policy_overrides" {
  command = plan

  variables {
    runner = {
      iam = {
        role = {
          arn     = "arn:aws:iam::123456789012:role/external-microvm-runner"
          name    = "external-microvm-runner"
          managed = false
        }
      }
    }
    config = {
      image_arn = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner-override"
      iam = {
        resource_arns = {
          images = ["arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner-*"]
        }
        additional_policy_json = {
          scale_up = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
        }
        managed_policies = {
          scale_up = {
            arn = "arn:aws:iam::123456789012:policy/microvm-scale-up"
          }
          pool = {
            arn = "arn:aws:iam::123456789012:policy/microvm-pool"
          }
        }
      }
    }
  }

  assert {
    condition = (
      output.provider.environment_variables.scale_up["MICROVM_EXECUTION_ROLE_ARN"] == "arn:aws:iam::123456789012:role/external-microvm-runner"
      && output.provider.environment_variables.scale_up["MICROVM_INGRESS_NETWORK_CONNECTORS"] == ""
      && output.provider.environment_variables.scale_up["MICROVM_EGRESS_NETWORK_CONNECTORS"] == ""
      && output.provider.environment_variables.scale_up["MICROVM_LOG_GROUP"] == "/github-self-hosted-runners/microvm-test/microvm"
      && data.aws_iam_policy_document.scale_up.statement[0].resources == toset(["*"])
      && data.aws_iam_policy_document.scale_up.statement[1].resources == toset(["arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner-*"])
      && data.aws_iam_policy_document.scale_up.statement[2].resources == toset(["arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/microvm-metadata/*"])
      && data.aws_iam_policy_document.scale_up.statement[3].resources == toset([
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/microvm-metadata",
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/microvm-metadata/*",
      ])
      && data.aws_iam_policy_document.scale_up.statement[4].resources == toset(["arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/microvm-metadata/*"])
      && data.aws_iam_policy_document.scale_up.statement[5].resources == toset(["arn:aws:iam::123456789012:role/external-microvm-runner"])
      && data.aws_iam_policy_document.scale_up.statement[6].resources == toset(["arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/tokens/*"])
      && data.aws_iam_policy_document.scale_down.statement[0].resources == toset(["*"])
      && data.aws_iam_policy_document.scale_down.statement[1].resources == toset(["arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner-*"])
      && data.aws_iam_policy_document.scale_down.statement[2].resources == toset(["arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/microvm-metadata/*"])
      && data.aws_iam_policy_document.scale_down.statement[3].resources == toset([
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/microvm-metadata",
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/microvm-metadata/*",
      ])
      && data.aws_iam_policy_document.scale_down.statement[4].resources == toset(["arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/tokens/*"])
    )
    error_message = "The provider-neutral external runner role and image allowlist must reach their scoped statements without narrowing required list, connector, or metadata permissions."
  }

  assert {
    condition = (
      output.provider.policies.scale_up.additional_iam_policy_json == "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
      && output.provider.policies.scale_up.managed_policy_enabled
      && output.provider.policies.scale_up.managed_policy_arn == "arn:aws:iam::123456789012:policy/microvm-scale-up"
      && output.provider.policies.pool.managed_policy_enabled
      && output.provider.policies.pool.managed_policy_arn == "arn:aws:iam::123456789012:policy/microvm-pool"
    )
    error_message = "Optional MicroVM policy attachments must stay controlled by wrapper presence."
  }


  assert {
    condition = (
      toset(keys(output.provider.policies.runner.inline_policies)) == toset(["cloudwatch", "runner_metadata", "runtime_logs", "ssm_jit"])
      && data.aws_iam_policy_document.runner_metadata.statement[0].resources == toset([
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/enable_cloudwatch",
        "arn:aws:ssm:eu-west-1:123456789012:parameter/github-action-runners/config/microvm-metadata/*.tags",
      ])
      && length(data.aws_iam_policy_document.runner_runtime_logs.statement) == 1
      && data.aws_iam_policy_document.runner_runtime_logs.statement[0].resources == toset(["arn:aws:logs:eu-west-1:123456789012:log-group:/github-self-hosted-runners/microvm-test/microvm:*"])
    )
    error_message = "The provider contract must keep plan-known runner-policy keys and scope runtime logging to its provider-managed group."
  }
}

run "disables_cloudwatch_agent_without_disabling_native_runtime_logging" {
  command = apply

  variables {
    config = {
      image_arn = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
      cloudwatch_agent = {
        enabled = false
      }
    }
  }

  assert {
    condition = (
      tostring(aws_ssm_parameter.runner_enable_cloudwatch.value) == "false"
      && length(aws_ssm_parameter.cloudwatch_agent_config_runner) == 0
      && length(aws_cloudwatch_log_group.gh_runners) == 0
      && length(local.logfiles) == 0
      && !contains(keys(output.provider.policies.runner.inline_policies), "cloudwatch")
      && length(output.provider.resources.runners_log_groups) == 1
      && output.provider.resources.runners_log_groups[0].name == aws_cloudwatch_log_group.runtime.name
      && output.provider.environment_variables.scale_up["MICROVM_LOG_GROUP"] == aws_cloudwatch_log_group.runtime.name
    )
    error_message = "Disabling the image CloudWatch agent must retain the explicit false flag and native RunMicrovm logging while removing only agent-owned resources and permissions."
  }
}

run "accepts_custom_cloudwatch_agent_config_and_log_group" {
  command = apply

  variables {
    config = {
      image_arn = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
      cloudwatch_agent = {
        enabled = true
        config  = "{\"agent\":{\"region\":\"eu-west-1\"}}"
      }
      log_files = [{
        log_group_name   = "custom-microvm"
        prefix_log_group = false
        file_path        = "/var/log/custom.log"
        log_stream_name  = "{microvm_id}/custom"
        log_class        = "INFREQUENT_ACCESS"
      }]
    }
  }

  assert {
    condition = (
      aws_ssm_parameter.cloudwatch_agent_config_runner[0].value == "{\"agent\":{\"region\":\"eu-west-1\"}}"
      && length(local.logfiles) == 1
      && local.logfiles[0].file_path == "/var/log/custom.log"
      && local.logfiles[0].log_group_class == "INFREQUENT_ACCESS"
      && local.logfiles[0].log_group_name == "/custom-microvm"
      && local.logfiles[0].log_stream_name == "{microvm_id}/custom"
      && aws_cloudwatch_log_group.gh_runners[0].name == "/custom-microvm"
      && aws_cloudwatch_log_group.gh_runners[0].log_group_class == "INFREQUENT_ACCESS"
      && data.aws_iam_policy_document.runner_cloudwatch[0].statement[1].resources == toset([
        "arn:aws:logs:eu-west-1:123456789012:log-group:/custom-microvm:*",
      ])
    )
    error_message = "Custom MicroVM agent configuration and log-file routing must replace the generated defaults without widening IAM."
  }
}

run "rejects_invalid_image_arn" {
  command = plan

  variables {
    config = {
      image_arn = "not-a-microvm-image-arn"
    }
  }

  expect_failures = [terraform_data.validate_config]
}

run "rejects_metadata_path_overlapping_jit_path" {
  command = plan

  variables {
    ssm = {
      paths = {
        root   = "/github-action-runners"
        tokens = "config/microvm-metadata"
        config = "config"
      }
    }
  }

  expect_failures = [terraform_data.validate_config]
}

run "rejects_invalid_metadata_path" {
  command = plan

  variables {
    ssm = {
      paths = {
        root   = "/github-action-runners"
        tokens = "tokens"
        config = "invalid config"
      }
    }
  }

  expect_failures = [terraform_data.validate_config]
}

run "rejects_invalid_image_resource_allowlist" {
  command = plan

  variables {
    config = {
      image_arn = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
      iam = {
        resource_arns = {
          images = []
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_config]
}

run "rejects_invalid_network_connector" {
  command = plan

  variables {
    config = {
      image_arn = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
      ingress_network_connectors = [
        " ",
      ]
    }
  }

  expect_failures = [terraform_data.validate_config]
}

run "rejects_more_than_ten_network_connectors" {
  command = plan

  variables {
    config = {
      image_arn = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
      egress_network_connectors = [
        for index in range(11) :
        "arn:aws:lambda:eu-west-1:123456789012:network-connector:egress-${index}"
      ]
    }
  }

  expect_failures = [terraform_data.validate_config]
}

run "rejects_unsupported_runner_architecture" {
  command = plan

  variables {
    runner = {
      os           = "linux"
      architecture = "x64"
      iam = {
        role = {
          arn  = "arn:aws:iam::123456789012:role/microvm-test-runner"
          name = "microvm-test-runner"
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_runner]
}

run "rejects_unsupported_runner_os" {
  command = plan

  variables {
    runner = {
      os           = "windows"
      architecture = "arm64"
      iam = {
        role = {
          arn  = "arn:aws:iam::123456789012:role/microvm-test-runner"
          name = "microvm-test-runner"
        }
      }
    }
  }

  expect_failures = [terraform_data.validate_runner]
}
