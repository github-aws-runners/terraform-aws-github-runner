mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }

  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/test-role"
    }
  }

  mock_resource "aws_cloudwatch_event_bus" {
    defaults = {
      arn = "arn:aws:events:eu-west-1:123456789012:event-bus/test"
    }
  }

  mock_resource "aws_cloudwatch_event_rule" {
    defaults = {
      arn = "arn:aws:events:eu-west-1:123456789012:rule/test"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:eu-west-1:123456789012:function:test"
    }
  }

  mock_resource "aws_sqs_queue" {
    defaults = {
      arn = "arn:aws:sqs:eu-west-1:123456789012:test"
    }
  }

  mock_resource "aws_s3_bucket" {
    defaults = {
      arn = "arn:aws:s3:::test-runner-binaries"
      id  = "test-runner-binaries"
    }
  }

  mock_resource "aws_apigatewayv2_api" {
    defaults = {
      execution_arn = "arn:aws:execute-api:eu-west-1:123456789012:test"
    }
  }
}

mock_provider "random" {}
mock_provider "null" {}

variables {
  aws_region    = "eu-west-1"
  aws_partition = "aws"
  prefix        = "scale-set-test"

  experimental_global_config = {
    runner = {
      os           = "linux"
      architecture = "x64"
    }
  }

  experimental_global_config_github = {
    app = {
      key_base64     = "test-app-key"
      id             = "test-app-id"
      webhook_secret = "test-webhook-secret"
    }
  }

  experimental_global_config_lambda = {
    artifact = {
      s3 = {
        bucket = "test-lambda-artifacts"
      }
    }
  }

  experimental_global_config_orchestration_provider = {
    scale_set = {
      grouping = {
        strategy = "runner_config"
      }
      container = {
        image = "public.ecr.aws/example/scale-set-controller@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
      config_store = {
        path_prefix = "/test/scale-set"
      }
      ecs = {
        task = {
          cpu              = 512
          memory           = 1024
          cpu_architecture = "X86_64"
        }
      }
      network = {
        vpc_id     = "vpc-scale-set"
        subnet_ids = ["subnet-scale-set-a", "subnet-scale-set-b"]
      }
      logging = {
        retention_in_days = 7
      }
    }
  }

  experimental_global_config_ssm = {
    kms_key_id = "arn:aws:kms:eu-west-1:123456789012:key/test"
    housekeeper = {
      lambda = {
        artifact = {
          s3 = {
            key = "housekeeper.zip"
          }
        }
      }
    }
  }

  experimental_global_config_compute_provider = {
    aws = {
      ec2 = {
        vpc_id     = "vpc-scale-set"
        subnet_ids = ["subnet-scale-set-a"]
        runner_binaries = {
          enabled = false
        }
      }
    }
  }

  experimental_multi_runner_config = {
    linux = {
      runner = {
        name_prefix = "linux-"
      }
      orchestration_provider = {
        scale_set = {
          github = {
            config_url = "https://github.com/example"
            installation_id_ssm = {
              name = "/github/scale-set/installation-id"
              arn  = "arn:aws:ssm:eu-west-1:123456789012:parameter/github/scale-set/installation-id"
            }
          }
          name                 = "linux-scale-set"
          id                   = 42
          runner_group_id      = 7
          min_runners          = 1
          max_runners          = 8
          boot_time_in_minutes = 12
          session_owner        = "test-owner"
          work_folder          = "_work/linux"
        }
      }
      compute_provider = {
        aws = {
          ec2 = {
            instance_types = ["m7i.large"]
            subnet_ids     = ["subnet-scale-set-a"]
            binaries_syncer = {
              enabled = false
            }
          }
        }
      }
    }
  }
}

run "routes_scale_set_through_runner_config_and_shared_controller" {
  command = plan

  assert {
    condition = (
      local.use_v2_config
      && keys(local.resolved_config.multi_runner_config) == ["linux"]
      && local.resolved_config.multi_runner_config.linux.orchestration_provider.scale_set.name == "linux-scale-set"
      && local.resolved_config.multi_runner_config.linux.orchestration_provider.scale_set.id == 42
    )
    error_message = "The multi-runner resolver must preserve the lane scale_set contract and its plan-known identity."
  }

  assert {
    condition = (
      length(module.runners) == 0
      && keys(module.runner_configs) == ["linux"]
      && output.runners_map_v2.linux.orchestration_provider.scale_set.name == "linux-scale-set"
      && output.runners_map_v2.linux.orchestration_provider.scale_set.id == 42
      && output.runners_map_v2.linux.provider.aws.ec2 != null
    )
    error_message = "Scale-set lanes must use runner-config and expose the selected compute-provider namespace."
  }

  assert {
    condition = (
      output.scale_set != null
      && output.scale_set.cluster.managed
      && keys(output.scale_set.controller_groups) == ["linux"]
      && output.scale_set.controller_groups.linux.runner_configs == ["linux"]
      && output.scale_set.reconciler_config_parameters["linux/linux"].tier == "Standard"
    )
    error_message = "Multi-runner must create one shared scale-set controller group and reconciler parameter for the selected lane."
  }
}
