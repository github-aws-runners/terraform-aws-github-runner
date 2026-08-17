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

variables {
  aws_region = "eu-west-1"
  prefix     = "microvm-test"

  tags = {
    Module = "runner"
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
    logging = {
      log_group = "/aws/lambda-microvms/runner"
    }
    maximum_duration_in_seconds = 3600
    environment_variables = {
      MICROVM_CLUSTER   = "runner-cluster"
      MICROVM_IMAGE_ARN = "caller-cannot-override-provider-contract"
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
  }
}

run "exposes_microvm_control_plane_contract" {
  command = plan

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
      && output.provider.environment_variables.scale_up["MICROVM_MAXIMUM_DURATION_IN_SECONDS"] == "3600"
      && output.provider.environment_variables.scale_up["MICROVM_LOG_GROUP"] == "/aws/lambda-microvms/runner"
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
        "MICROVM_MAXIMUM_DURATION_IN_SECONDS",
      ])
      && output.provider.environment_variables.scale_up == output.provider.environment_variables.scale_down
      && output.provider.environment_variables.scale_up == output.provider.environment_variables.pool
      && !contains(keys(output.provider.environment_variables.scale_up), "RUNNER_BOOT_TIME_IN_MINUTES")
      && !contains(keys(output.provider.environment_variables.scale_up), "MICROVM_IMAGE_IDENTIFIER")
      && !contains(keys(output.provider.environment_variables.scale_up), "MICROVM_RUN_CONFIG")
      && !contains(keys(output.provider.environment_variables.scale_up), "MICROVM_TAGS")
    )
    error_message = "All three control-plane fragments must match the runtime key inventory and omit stale or webhook-owned keys."
  }

  assert {
    condition = (
      data.aws_iam_policy_document.scale_up.statement[0].actions == toset(["lambda:ListMicrovms", "lambda:PassNetworkConnector"])
      && data.aws_iam_policy_document.scale_up.statement[0].resources == toset(["*"])
      && data.aws_iam_policy_document.scale_up.statement[1].actions == toset(["lambda:RunMicrovm"])
      && data.aws_iam_policy_document.scale_up.statement[1].resources == toset(["*"])
      && data.aws_iam_policy_document.scale_up.statement[2].actions == toset(["lambda:ListTags", "lambda:TagResource", "lambda:TerminateMicrovm"])
      && data.aws_iam_policy_document.scale_up.statement[2].resources == toset(["*"])
      && data.aws_iam_policy_document.scale_up.statement[3].actions == toset(["iam:PassRole"])
      && data.aws_iam_policy_document.scale_up.statement[3].resources == toset(["arn:aws:iam::123456789012:role/microvm-test-runner"])
      && data.aws_iam_policy_document.scale_down.statement[0].actions == toset(["lambda:ListMicrovms"])
      && data.aws_iam_policy_document.scale_down.statement[0].resources == toset(["*"])
      && data.aws_iam_policy_document.scale_down.statement[1].actions == toset(["lambda:ListTags", "lambda:TagResource", "lambda:TerminateMicrovm", "lambda:UntagResource"])
    )
    error_message = "The MicroVM provider must own every control-plane action used by scale-up, pool, scale-down, and connector overrides."
  }

  assert {
    condition = (
      toset(keys(output.provider.policies)) == toset(["runner", "scale_up", "scale_down", "pool"])
      && toset(keys(output.provider.policies.runner.inline_policies)) == toset(["runtime_logs", "ssm_jit"])
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
      && data.aws_iam_policy_document.runner_runtime_logs.statement[0].actions == toset(["logs:CreateLogGroup"])
      && data.aws_iam_policy_document.runner_runtime_logs.statement[0].resources == toset(["arn:aws:logs:eu-west-1:123456789012:log-group:/aws/lambda-microvms/runner"])
      && data.aws_iam_policy_document.runner_runtime_logs.statement[1].actions == toset(["logs:CreateLogStream", "logs:PutLogEvents"])
      && data.aws_iam_policy_document.runner_runtime_logs.statement[1].resources == toset(["arn:aws:logs:eu-west-1:123456789012:log-group:/aws/lambda-microvms/runner:*"])
    )
    error_message = "Managed MicroVM runners must receive only lane-token JIT access and the configured runtime log-group permissions."
  }

  assert {
    condition = output.provider.resources == {
      image_arn          = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
      image_version      = "3"
      execution_role_arn = "arn:aws:iam::123456789012:role/microvm-test-runner"
    }
    error_message = "The MicroVM provider must expose its selected image and execution role as provider resources."
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
          images   = ["arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner-*"]
          microvms = ["arn:aws:lambda:eu-west-1:123456789012:microvm:*"]
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
      && output.provider.environment_variables.scale_up["MICROVM_LOG_GROUP"] == ""
      && output.provider.environment_variables.scale_up["MICROVM_MAXIMUM_DURATION_IN_SECONDS"] == ""
      && data.aws_iam_policy_document.scale_up.statement[0].resources == toset(["*"])
      && data.aws_iam_policy_document.scale_up.statement[1].resources == toset(["arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner-*"])
      && data.aws_iam_policy_document.scale_up.statement[2].resources == toset(["arn:aws:lambda:eu-west-1:123456789012:microvm:*"])
      && data.aws_iam_policy_document.scale_up.statement[3].resources == toset(["arn:aws:iam::123456789012:role/external-microvm-runner"])
      && data.aws_iam_policy_document.scale_down.statement[0].resources == toset(["*"])
      && data.aws_iam_policy_document.scale_down.statement[1].resources == toset(["arn:aws:lambda:eu-west-1:123456789012:microvm:*"])
    )
    error_message = "The provider-neutral external runner role and split image/MicroVM allowlists must reach their scoped statements without narrowing required list or connector permissions."
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
      toset(keys(output.provider.policies.runner.inline_policies)) == toset(["runtime_logs", "ssm_jit"])
      && data.aws_iam_policy_document.runner_runtime_logs.statement[0].resources == toset(["arn:aws:logs:eu-west-1:123456789012:log-group:/aws/lambda/microvms/*"])
      && data.aws_iam_policy_document.runner_runtime_logs.statement[1].resources == toset(["arn:aws:logs:eu-west-1:123456789012:log-group:/aws/lambda/microvms/*:*"])
    )
    error_message = "The provider contract must keep plan-known runner-policy keys and scope default runtime logging to Lambda MicroVM log groups."
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

run "rejects_fractional_maximum_duration" {
  command = plan

  variables {
    config = {
      image_arn                   = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
      maximum_duration_in_seconds = 1.5
    }
  }

  expect_failures = [terraform_data.validate_config]
}

run "rejects_blank_log_group" {
  command = plan

  variables {
    config = {
      image_arn = "arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner"
      logging = {
        log_group = " "
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
