mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
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

# The runner archive is injected during packaging; isolate the common
# housekeeper child so this source-checkout test remains deterministic.
override_module {
  target = module.ssm_housekeeper
}

variables {
  aws_region = "eu-west-1"

  runner = {
    labels = ["self-hosted", "linux", "x64"]
  }

  github = {
    app_parameters = {
      key_base64 = [{
        name = "/github-runner/key-base64"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/key-base64"
      }]
      id = [{
        name = "/github-runner/app-id"
        arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/app-id"
      }]
      installation_id = [null]
    }
  }

  lambda = {
    artifact = {
      s3 = {
        bucket = "test-lambda-bucket"
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
            arn = "arn:aws:s3:::test-runner-binaries"
            id  = "test-runner-binaries"
            key = "runners/linux/actions-runner.tar.gz"
          }
        }
      }
    }
  }

  orchestration_provider = {
    scale_set = {
      github = {
        config_url = "https://github.com/example"
        installation_id_ssm = {
          name = "/github-runner/installation-id"
          arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github-runner/installation-id"
        }
      }
      name        = "linux-scale-set"
      id          = 42
      min_runners = 1
      max_runners = 4
      work_folder = "_work/linux-scale-set"
    }
  }
}

run "selects_scale_set_and_forces_ephemeral_jit" {
  command = plan

  assert {
    condition = (
      local.orchestration_provider_type == "scale_set"
      && length(module.orchestration_webhook) == 0
      && output.orchestration_provider.webhook == null
      && output.orchestration_provider.scale_set.name == "linux-scale-set"
      && output.orchestration_provider.scale_set.id == 42
    )
    error_message = "Runner-config must select scale_set as the only orchestration provider and preserve its identity contract."
  }

  assert {
    condition = (
      output.scale_up == null
      && output.scale_down == null
      && output.pool == null
      && aws_ssm_parameter.runner_agent_mode.value == "ephemeral"
      && aws_ssm_parameter.jit_config_enabled.value == "true"
    )
    error_message = "Scale-set orchestration must omit webhook controls and force ephemeral JIT runner registration."
  }

  assert {
    condition = (
      output.compute_provider_contract.type == "ec2"
      && output.compute_provider_contract.capabilities.scale_set.configuration_json != "{}"
    )
    error_message = "Runner-config must expose the selected compute provider's scale_set capability for the shared controller."
  }
}
