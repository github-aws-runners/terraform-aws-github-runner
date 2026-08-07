mock_provider "aws" {
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
    image_identifier = "arn:aws:lambdamicrovms:eu-west-1:123456789012:image/runner"
    image_version    = "3"
    egress_network_connectors = [
      "egress-connector"
    ]
    idle_policy = {
      max_idle_duration_seconds  = 300
      suspended_duration_seconds = 900
      auto_resume_enabled        = true
    }
    logging = {
      cloud_watch = {
        log_group  = "/aws/lambdamicrovms/runner"
        log_stream = "runtime"
      }
    }
    run_hook_payload            = "{\"runner\":\"test\"}"
    maximum_duration_in_seconds = 3600
    environment_variables = {
      MICROVM_CLUSTER = "runner-cluster"
    }
    tags = {
      Provider = "microvm"
    }
  }

  runner = {
    boot_time_in_minutes = 7
    name_prefix          = "microvm-"
    iam = {
      role = {
        arn  = "arn:aws:iam::123456789012:role/microvm-test-runner"
        name = "microvm-test-runner"
      }
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
      && output.provider.environment_variables.scale_up["MICROVM_IMAGE_IDENTIFIER"] == "arn:aws:lambdamicrovms:eu-west-1:123456789012:image/runner"
      && output.provider.environment_variables.scale_up["MICROVM_IMAGE_VERSION"] == "3"
      && output.provider.environment_variables.scale_up["MICROVM_EXECUTION_ROLE_ARN"] == "arn:aws:iam::123456789012:role/microvm-test-runner"
      && output.provider.environment_variables.scale_down["RUNNER_BOOT_TIME_IN_MINUTES"] == 7
      && output.provider.environment_variables.pool["RUNNER_BOOT_TIME_IN_MINUTES"] == 7
    )
    error_message = "The MicroVM provider must expose scale-up, scale-down, and pool environment fragments."
  }

  assert {
    condition = (
      jsondecode(output.provider.environment_variables.scale_up["MICROVM_RUN_CONFIG"]).imageIdentifier == "arn:aws:lambdamicrovms:eu-west-1:123456789012:image/runner"
      && jsondecode(output.provider.environment_variables.scale_up["MICROVM_RUN_CONFIG"]).executionRoleArn == "arn:aws:iam::123456789012:role/microvm-test-runner"
      && jsondecode(output.provider.environment_variables.scale_up["MICROVM_RUN_CONFIG"]).idlePolicy.maxIdleDurationSeconds == 300
      && jsondecode(output.provider.environment_variables.scale_up["MICROVM_RUN_CONFIG"]).logging.cloudWatch.logGroup == "/aws/lambdamicrovms/runner"
      && jsondecode(output.provider.environment_variables.scale_up["MICROVM_TAGS"]).Provider == "microvm"
      && jsondecode(output.provider.environment_variables.scale_up["MICROVM_TAGS"])["ghr:environment"] == "microvm-test"
    )
    error_message = "The MicroVM provider must encode the RunMicrovm request and protected runner tags."
  }

  assert {
    condition = (
      contains(data.aws_iam_policy_document.scale_up.statement[0].actions, "lambdamicrovms:RunMicrovm")
      && contains(data.aws_iam_policy_document.scale_up.statement[0].actions, "lambdamicrovms:CreateMicrovmAuthToken")
      && data.aws_iam_policy_document.scale_up.statement[1].actions == toset(["iam:PassRole"])
      && data.aws_iam_policy_document.scale_up.statement[1].resources == toset(["arn:aws:iam::123456789012:role/microvm-test-runner"])
      && contains(data.aws_iam_policy_document.scale_down.statement[0].actions, "lambdamicrovms:TerminateMicrovm")
    )
    error_message = "The MicroVM provider must own MicroVM scale-up, scale-down, and PassRole permissions."
  }

  assert {
    condition = (
      toset(keys(output.provider.policies)) == toset(["runner", "scale_up", "scale_down", "pool"])
      && length(output.provider.policies.runner.inline_policies) == 0
      && !output.provider.policies.scale_up.managed_policy_enabled
      && !output.provider.policies.pool.managed_policy_enabled
    )
    error_message = "The MicroVM provider must return policy fragments grouped by common component."
  }

  assert {
    condition = output.provider.resources == {
      image_identifier   = "arn:aws:lambdamicrovms:eu-west-1:123456789012:image/runner"
      image_version      = "3"
      execution_role_arn = "arn:aws:iam::123456789012:role/microvm-test-runner"
    }
    error_message = "The MicroVM provider must expose its selected image and execution role as provider resources."
  }
}

run "accepts_external_execution_role_and_policy_overrides" {
  command = plan

  variables {
    config = {
      image_identifier = "runner-image"
      execution_role = {
        arn = "arn:aws:iam::123456789012:role/external-microvm-execution"
      }
      logging = {
        disabled = true
      }
      iam = {
        resource_arns = ["arn:aws:lambdamicrovms:eu-west-1:123456789012:microvm/*"]
        actions = {
          scale_up   = ["lambdamicrovms:RunMicrovm"]
          scale_down = ["lambdamicrovms:TerminateMicrovm"]
        }
        additional_policy_json = {
          scale_up = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
        }
        managed_policy_arns = {
          scale_up = "arn:aws:iam::123456789012:policy/microvm-scale-up"
          pool     = "arn:aws:iam::123456789012:policy/microvm-pool"
        }
      }
    }
  }

  assert {
    condition = (
      output.provider.environment_variables.scale_up["MICROVM_EXECUTION_ROLE_ARN"] == "arn:aws:iam::123456789012:role/external-microvm-execution"
      && jsondecode(output.provider.environment_variables.scale_up["MICROVM_RUN_CONFIG"]).logging.disabled == {}
      && data.aws_iam_policy_document.scale_up.statement[0].actions == toset(["lambdamicrovms:RunMicrovm"])
      && data.aws_iam_policy_document.scale_up.statement[0].resources == toset(["arn:aws:lambdamicrovms:eu-west-1:123456789012:microvm/*"])
      && data.aws_iam_policy_document.scale_up.statement[1].resources == toset(["arn:aws:iam::123456789012:role/external-microvm-execution"])
      && data.aws_iam_policy_document.scale_down.statement[0].actions == toset(["lambdamicrovms:TerminateMicrovm"])
    )
    error_message = "External execution role and action/resource overrides must reach the MicroVM provider contract."
  }

  assert {
    condition = (
      output.provider.policies.scale_up.additional_iam_policy_json == "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
      && output.provider.policies.scale_up.managed_policy_enabled
      && output.provider.policies.scale_up.managed_policy_arn == "arn:aws:iam::123456789012:policy/microvm-scale-up"
      && output.provider.policies.pool.managed_policy_enabled
      && output.provider.policies.pool.managed_policy_arn == "arn:aws:iam::123456789012:policy/microvm-pool"
    )
    error_message = "Optional MicroVM policy attachments must stay controlled by object presence."
  }
}

run "rejects_empty_image_identifier" {
  command = plan

  variables {
    config = {
      image_identifier = " "
    }
  }

  expect_failures = [terraform_data.validate_config]
}

run "returns_microvm_assume_role_policy" {
  command = plan

  assert {
    condition     = toset(data.aws_iam_policy_document.assume_role.statement[0].actions) == toset(["sts:AssumeRole", "sts:TagSession"])
    error_message = "The MicroVM runner role must allow assume-role and tagged sessions."
  }

  assert {
    condition = anytrue([
      for principal in data.aws_iam_policy_document.assume_role.statement[0].principals :
      principal.type == "Service" && toset(principal.identifiers) == toset(["lambda.amazonaws.com"])
    ])
    error_message = "The MicroVM runner role must trust the configured service principals."
  }

  assert {
    condition     = output.assume_role_policy == data.aws_iam_policy_document.assume_role.json
    error_message = "The MicroVM provider must return its rendered assume-role policy."
  }
}

run "rejects_empty_trust_services" {
  command = plan

  variables {
    config = {
      image_identifier           = "arn:aws:lambdamicrovms:eu-west-1:123456789012:image/runner"
      runner_role_trust_services = []
    }
  }

  expect_failures = [terraform_data.validate_config]
}
